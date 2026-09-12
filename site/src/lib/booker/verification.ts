import crypto from 'node:crypto';
import { checkSms, sendSms, normaliseSmsNumber, requireSms } from './sms.ts';
import { lockOperation, completeMobileChange, type ManagementContext } from './mobile-management.ts';
export type VerificationPurpose = 'booking' | 'login' | 'account-email' | 'account-sms';
import { getPool } from '../booking/db.ts';
import { sendEmail } from '../email/sender.ts';
import { accountForIdentity, BookerError, claimBookings, hashToken, storeSession, type Identity } from './accounts.ts';

function secret(): string {
  const value = process.env.BOOKER_VERIFICATION_SECRET;
  if (!value || value.length < 32) throw new BookerError('Verification is temporarily unavailable. Please try again later.', 503);
  return value;
}
export function codeDigest(id: string, code: string): string {
  return crypto.createHmac('sha256', secret()).update(`${id}:${code}`).digest('hex');
}
export type VerificationDelivery = {
  send(identity: Identity, code: string): Promise<string | { id: string; expiresAt: number } | null>;
  check(providerId: string, code: string): Promise<boolean>;
};
const delivery: VerificationDelivery = {
  async send(identity, code) {
    if (identity.channel === 'sms') return sendSms(identity.identifier);
    await sendEmail({ to: identity.identifier, suppressDefaultBcc: true, subject: 'Your Olrig Bank verification code',
      text: `Your Olrig Bank verification code is ${code}. It expires in 10 minutes. If you did not request it, you can ignore this email.`,
      html: `<p>Your Olrig Bank verification code is <strong>${code}</strong>.</p><p>It expires in 10 minutes. If you did not request it, you can ignore this email.</p>` });
    return null;
  },
  check: checkSms,
};
export async function requestCode(input: { identity: Identity; purpose: VerificationPurpose; browserHash: string; ip: string; operationId?: string; management?: ManagementContext }, provider = delivery) {
  secret();
  if (input.identity.channel === 'sms') {
    input.identity = { channel: 'sms', identifier: normaliseSmsNumber(input.identity.identifier) };
    if (provider === delivery) requireSms();
  }
  const client = await getPool().connect();
  const destinationHash = hashToken(`${input.identity.channel}:${input.identity.identifier}`);
  const ipHash = hashToken(input.ip);
  const code = crypto.randomInt(0, 1000000).toString().padStart(6, '0');
  let id = '';
  let known = true;
  let expiresIn = 600;
  try {
    await client.query('BEGIN');
    if (input.purpose.startsWith('account-')) {
      if (!input.operationId || !input.management) throw new BookerError('Sign in to manage SMS access.',401);
      const op = await lockOperation(client,input.operationId,input.management);
      const emailStep = input.purpose === 'account-email';
      if ((emailStep && op.email_verified_at) || (!emailStep && (!op.email_verified_at || op.action==='remove'))
        || input.identity.channel !== (emailStep ? 'email' : 'sms')
        || input.identity.identifier !== (emailStep ? op.email_identifier : op.identifier)) throw new BookerError('Start this verification step again.',403);
    }
    // Sorted locks serialise both dimensions across every application instance.
    for (const key of [`destination:${destinationHash}`, `ip:${ipHash}`].sort()) await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [key]);
    const counts = await client.query(`SELECT
      COUNT(*) FILTER(WHERE destination_hash=$1)::int AS destination,
      COUNT(*) FILTER(WHERE ip_hash=$2)::int AS ip,
      COALESCE(EXTRACT(EPOCH FROM NOW()-MAX(created_at) FILTER(WHERE destination_hash=$1)),3600)::int AS elapsed
      FROM booker_verification_requests WHERE created_at>NOW()-INTERVAL '1 hour'`, [destinationHash, ipHash]);
    const count = counts.rows[0];
    if (count.elapsed < 60 || count.destination >= 5 || count.ip >= 20) throw new BookerError('Please wait before requesting another code.', 429, count.elapsed < 60 ? 60 - count.elapsed : 3600);
    await client.query('INSERT INTO booker_verification_requests(destination_hash,ip_hash) VALUES($1,$2)', [destinationHash, ipHash]);
    if (input.purpose === 'login') {
      const match = await client.query(`SELECT 1 FROM booker_identities WHERE channel=$1 AND identifier=$2
        UNION ALL SELECT 1 FROM provisional_bookings WHERE booker_account_id IS NULL AND booker_claim_channel=$1 AND booker_claim_identifier=$2 AND deletion_requested_at IS NULL LIMIT 1`, [input.identity.channel, input.identity.identifier]);
      known = Boolean(match.rowCount);
    }
    await client.query('UPDATE booker_challenges SET consumed_at=NOW() WHERE browser_hash=$1 AND purpose=$2 AND consumed_at IS NULL', [input.browserHash, input.purpose]);
    const created = await client.query('INSERT INTO booker_challenges(browser_hash,channel,identifier,purpose,operation_id) VALUES($1,$2,$3,$4,$5) RETURNING id', [input.browserHash, input.identity.channel, input.identity.identifier, input.purpose,input.operationId || null]);
    id = created.rows[0].id;
    await client.query('UPDATE booker_challenges SET code_hash=$2 WHERE id=$1', [id, codeDigest(id, code)]);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  try {
    if (known) {
      const result = await provider.send(input.identity, code);
      const providerId = typeof result === 'object' && result ? result.id : result;
      const expiresAt = typeof result === 'object' && result ? new Date(result.expiresAt) : null;
      const updated = await getPool().query('UPDATE booker_challenges SET delivered=TRUE,provider_id=$2,expires_at=LEAST(expires_at,COALESCE($3::timestamptz,expires_at)) WHERE id=$1 AND consumed_at IS NULL RETURNING EXTRACT(EPOCH FROM expires_at-NOW()) AS remaining', [id, providerId,expiresAt]);
      expiresIn = Math.max(0,Math.floor(Number(updated.rows[0]?.remaining || 0)));
    }
  } catch (error) {
    await getPool().query('UPDATE booker_challenges SET consumed_at=NOW() WHERE id=$1', [id]);
    if (input.purpose !== 'login' && error instanceof BookerError) throw error;
    if (input.purpose !== 'login') throw new BookerError('The code could not be sent. Check your contact details and try again shortly.', 503, 60);
  }
  return { challengeId: id, retryAfter: 60, expiresIn: input.purpose === 'login' ? 600 : expiresIn, message: input.purpose === 'login' ? 'If that contact is on file, we have sent a code.' : 'Your code has been sent.' };
}
export async function checkCode(input: { id: string; code: string; browserHash: string; purpose: VerificationPurpose; operationId?: string; management?: ManagementContext }, provider = delivery) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const operation = input.purpose.startsWith('account-') && input.operationId && input.management
      ? await lockOperation(client,input.operationId,input.management) : null;
    if (input.purpose.startsWith('account-') && !operation) throw new BookerError('Sign in to manage SMS access.',401);
    if (operation && ((input.purpose==='account-email' && operation.email_verified_at) || (input.purpose==='account-sms' && !operation.email_verified_at)))
      throw new BookerError('Start this verification step again.',403);
    if (!operation) {
      const contact = (await client.query('SELECT channel,identifier FROM booker_challenges WHERE id=$1 AND browser_hash=$2',[input.id,input.browserHash])).rows[0];
      if (contact) await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`booker:${contact.channel}:${contact.identifier}`]);
    }
    const selected = await client.query(`SELECT * FROM booker_challenges WHERE id=$1 AND browser_hash=$2 AND purpose=$3
      AND consumed_at IS NULL AND expires_at>NOW() AND attempts<5 AND operation_id IS NOT DISTINCT FROM $4::uuid FOR UPDATE`, [input.id, input.browserHash, input.purpose,input.operationId || null]);
    const challenge = selected.rows[0];
    if (!challenge) throw new BookerError('The code is invalid or has expired. Request another code.');
    await client.query('UPDATE booker_challenges SET attempts=attempts+1 WHERE id=$1', [input.id]);
    let valid = false;
    if (challenge.delivered && /^\d{6}$/.test(input.code)) {
      if (challenge.channel === 'email') valid = crypto.timingSafeEqual(Buffer.from(codeDigest(input.id, input.code), 'hex'), Buffer.from(challenge.code_hash, 'hex'));
      else {
        try { valid = await provider.check(challenge.provider_id, input.code); }
        catch (error) { await client.query('COMMIT'); if (error instanceof BookerError) throw error; throw new BookerError('Verification is temporarily unavailable. Please try again.', 503); }
      }
    }
    if (!valid) {
      await client.query('COMMIT');
      throw new BookerError('The code is invalid or has expired. Check it or request another code.');
    }
    await client.query('UPDATE booker_challenges SET consumed_at=NOW() WHERE id=$1', [input.id]);
    let sessionToken: string | null = null;
    if (operation) {
      if (input.purpose === 'account-email') {
        await client.query('UPDATE booker_mobile_operations SET email_verified_at=NOW() WHERE id=$1',[operation.id]);
        if (operation.action === 'remove') sessionToken = await completeMobileChange(client,operation);
      } else sessionToken = await completeMobileChange(client,operation);
    } else if (input.purpose === 'booking') {
      await client.query('UPDATE booker_verification_grants SET consumed_at=NOW() WHERE browser_hash=$1 AND consumed_at IS NULL', [input.browserHash]);
      await client.query('INSERT INTO booker_verification_grants(browser_hash,channel,identifier) VALUES($1,$2,$3)', [input.browserHash, challenge.channel, challenge.identifier]);
    } else {
      const identity: Identity = { channel: challenge.channel, identifier: challenge.identifier };
      const accountId = await accountForIdentity(client, identity);
      await claimBookings(client, accountId, identity);
      sessionToken = await storeSession(client, accountId);
    }
    await client.query('COMMIT');
    return { sessionToken, verified: true, nextStep: operation && input.purpose==='account-email' && operation.action!=='remove' ? 'sms' : 'complete', expiresIn: input.purpose === 'booking' ? 1800 : 30 * 86400 };
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}
