import crypto from 'node:crypto';
import type { AstroCookies } from 'astro';
import type { PoolClient } from 'pg';
import { getPool } from '../booking/db.ts';
import { validBookerEmail } from '../booking/booking-contact.ts';
import { normaliseWhatsAppTelephone } from '../booking/whatsapp-phone.ts';

export const SESSION_COOKIE = 'olrig_booker_session';
export const BROWSER_COOKIE = 'olrig_booker_browser';
export const randomToken = () => crypto.randomBytes(32).toString('base64url');
export const hashToken = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
export type Identity = { channel: 'email' | 'sms'; identifier: string };
export class BookerError extends Error {
  status: number;
  retryAfter: number;
  constructor(message: string, status = 400, retryAfter = 0) { super(message); this.status = status; this.retryAfter = retryAfter; }
}
export function normaliseIdentity(channel: unknown, value: unknown): Identity {
  if (typeof value !== 'string' || value.length > 254) throw new BookerError('Enter a valid email address or mobile number.');
  if (channel === 'email') {
    const identifier = value.trim().toLowerCase();
    if (validBookerEmail(identifier)) return { channel, identifier };
  } else if (channel === 'sms') {
    const identifier = normaliseWhatsAppTelephone(value);
    if (identifier) return { channel, identifier };
  }
  throw new BookerError('Enter a valid email address or mobile number, including its country code.');
}
export function setCookie(cookies: AstroCookies, name: string, value: string, url: URL, seconds: number) {
  cookies.set(name, value, { httpOnly: true, secure: url.protocol === 'https:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), sameSite: 'lax', path: '/', maxAge: seconds });
}
export function browserToken(cookies: AstroCookies, url: URL): string {
  const existing = cookies.get(BROWSER_COOKIE)?.value;
  if (existing && /^[A-Za-z0-9_-]{43}$/.test(existing)) return existing;
  const token = randomToken(); setCookie(cookies, BROWSER_COOKIE, token, url, 86400); return token;
}
export async function sessionAccount(cookies: AstroCookies): Promise<string | null> {
  const token = cookies.get(SESSION_COOKIE)?.value;
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const result = await getPool().query('SELECT account_id FROM booker_sessions WHERE token_hash=$1 AND expires_at>NOW()', [hashToken(token)]);
  return result.rows[0]?.account_id ?? null;
}
export async function storeSession(client: PoolClient, accountId: string): Promise<string> {
  const token = randomToken();
  await client.query("INSERT INTO booker_sessions(token_hash,account_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '30 days')", [hashToken(token), accountId]);
  return token;
}
export function setSession(cookies: AstroCookies, token: string, url: URL) { setCookie(cookies, SESSION_COOKIE, token, url, 30 * 86400); }
export async function accountForIdentity(client: PoolClient, identity: Identity): Promise<string> {
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`booker:${identity.channel}:${identity.identifier}`]);
  const existing = await client.query('SELECT account_id FROM booker_identities WHERE channel=$1 AND identifier=$2', [identity.channel, identity.identifier]);
  if (existing.rowCount) return existing.rows[0].account_id;
  const created = await client.query('INSERT INTO booker_accounts DEFAULT VALUES RETURNING id');
  const id = created.rows[0].id;
  await client.query('INSERT INTO booker_identities(channel,identifier,account_id) VALUES($1,$2,$3)', [identity.channel, identity.identifier, id]);
  return id;
}
export async function claimBookings(client: PoolClient, accountId: string, identity: Identity) {
  await client.query(`UPDATE provisional_bookings SET booker_account_id=$1 WHERE booker_account_id IS NULL
    AND booker_claim_channel=$2 AND booker_claim_identifier=$3 AND deletion_requested_at IS NULL`, [accountId, identity.channel, identity.identifier]);
}
export type BookingAuthorisation = { browserHash: string; accountId: string | null; email: string; mobile: string | null; submissionId: string };
export async function verifiedBookingIdentity(client: PoolClient, input: BookingAuthorisation): Promise<{ identity: Identity; grantId: string | null }> {
  if (input.accountId) {
    const owned = await client.query(`SELECT channel,identifier FROM booker_identities WHERE account_id=$1
      AND ((channel='email' AND identifier=$2) OR (channel='sms' AND identifier=$3)) LIMIT 1`, [input.accountId, input.email, input.mobile]);
    if (owned.rowCount) return { identity: owned.rows[0], grantId: null };
  }
  const grants = await client.query(`SELECT id,channel,identifier FROM booker_verification_grants
    WHERE browser_hash=$1 AND consumed_at IS NULL AND expires_at>NOW()
    AND ((channel='email' AND identifier=$2) OR (channel='sms' AND identifier=$3))
    ORDER BY expires_at DESC LIMIT 1 FOR UPDATE`, [input.browserHash, input.email, input.mobile]);
  if (!grants.rowCount) throw new BookerError('Verify your email address or mobile number before continuing.', 403);
  return { identity: grants.rows[0], grantId: grants.rows[0].id };
}

/** Recover a committed request before rechecking a quote that might since have changed. */
export async function resumeSubmission(submissionId: string, browserHash: string) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`submission:${submissionId}`]);
    const result = await client.query(`SELECT pb.public_id::text AS reference,s.account_id,s.browser_hash,
      s.created_at>NOW()-INTERVAL '30 minutes' AS recent FROM booker_submissions s
      JOIN provisional_bookings pb ON pb.id=s.booking_id WHERE s.id=$1 AND pb.deletion_requested_at IS NULL`, [submissionId]);
    if (!result.rowCount) { await client.query('COMMIT'); return null; }
    const prior = result.rows[0];
    if (prior.browser_hash !== browserHash || !prior.recent) throw new BookerError('This request has already been submitted. Sign in to view your bookings.', 409);
    const sessionToken = await storeSession(client, prior.account_id);
    await client.query('COMMIT');
    return { reference: prior.reference as string, sessionToken };
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}
