import crypto from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { getPool } from '../booking/db.ts';
import { bookingAccessState, getBookingAccessExpiryDays } from '../booking/booking-access-policy.ts';
import { AI_PLAN_VERSION } from './ai-representation.ts';

const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const tokenHash = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

export type AiCapabilityAccess = {
  capabilityId: string;
  planId: string;
  bookingId: string;
  protocolVersion: typeof AI_PLAN_VERSION;
  scopes: ['plan:read', 'proposal:submit'];
};

export const AI_CAPABILITY_RATE_LIMITS = {
  read: { requests: 120, windowMinutes: 15 },
  proposal: { requests: 10, windowMinutes: 60 },
} as const;

export type AiCapabilityAuthorization = { access: AiCapabilityAccess | null; rateLimited: boolean };

export function createAiCapabilityCredential(): { token: string; hash: string } {
  const token = crypto.randomBytes(32).toString('base64url');
  return { token, hash: tokenHash(token) };
}

export async function resolveAiCapabilityCredential(
  token: string,
  recordUse = false,
  database: Pick<Pool, 'query'> = getPool(),
): Promise<AiCapabilityAccess | null> {
  if (!tokenPattern.test(token)) return null;
  const result = await database.query<any>(
    `SELECT c.id::text AS capability_id, hp.public_id::text AS plan_id,
            pb.id::text AS booking_id, c.protocol_version, c.scopes,
            pb.departure::text, pb.customer_access_token_revoked_at AS booking_access_revoked_at
       FROM plan_ai_capabilities c
       JOIN holiday_plans hp ON hp.id = c.holiday_plan_id
       JOIN provisional_bookings pb ON pb.id = hp.booking_id
      WHERE c.token_hash = $1 AND c.revoked_at IS NULL AND c.expires_at > NOW()
        AND hp.plan_type = 'booking_linked' AND hp.archived_at IS NULL AND hp.deletion_requested_at IS NULL
        AND pb.deletion_requested_at IS NULL`,
    [tokenHash(token)],
  );
  if (!result.rowCount) return null;
  const row = result.rows[0];
  if (bookingAccessState({
    departure: row.departure,
    revokedAt: row.booking_access_revoked_at,
    expiryDays: getBookingAccessExpiryDays(),
  }) !== 'active') return null;
  if (recordUse) {
    await database.query('UPDATE plan_ai_capabilities SET last_accessed_at = NOW() WHERE id = $1', [row.capability_id]);
  }
  return {
    capabilityId: row.capability_id,
    planId: row.plan_id,
    bookingId: row.booking_id,
    protocolVersion: row.protocol_version,
    scopes: row.scopes,
  };
}

export async function authorizeAiCapabilityRequest(
  token: string,
  requestKind: keyof typeof AI_CAPABILITY_RATE_LIMITS,
  database: Pick<Pool, 'connect'> = getPool(),
): Promise<AiCapabilityAuthorization> {
  if (!tokenPattern.test(token)) return { access: null, rateLimited: false };
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query<any>(
      `SELECT c.id::text AS capability_id, hp.public_id::text AS plan_id,
              pb.id::text AS booking_id, c.protocol_version, c.scopes, c.expires_at,
              c.read_window_started_at, c.read_request_count,
              c.proposal_window_started_at, c.proposal_request_count,
              pb.departure::text, pb.customer_access_token_revoked_at AS booking_access_revoked_at
         FROM plan_ai_capabilities c
         JOIN holiday_plans hp ON hp.id=c.holiday_plan_id
         JOIN provisional_bookings pb ON pb.id=hp.booking_id
        WHERE c.token_hash=$1 AND c.revoked_at IS NULL
          AND hp.plan_type='booking_linked' AND hp.archived_at IS NULL AND hp.deletion_requested_at IS NULL
          AND pb.deletion_requested_at IS NULL
        FOR UPDATE OF c`,
      [tokenHash(token)],
    );
    if (!result.rowCount) { await client.query('ROLLBACK'); return { access: null, rateLimited: false }; }
    const row = result.rows[0];
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      await recordAccessEvent(client, row.capability_id, requestKind, 'expired');
      await client.query('COMMIT'); return { access: null, rateLimited: false };
    }
    if (bookingAccessState({ departure: row.departure, revokedAt: row.booking_access_revoked_at,
      expiryDays: getBookingAccessExpiryDays() }) !== 'active') {
      await recordAccessEvent(client, row.capability_id, requestKind, 'booking_inactive');
      await client.query('COMMIT'); return { access: null, rateLimited: false };
    }
    const limit = AI_CAPABILITY_RATE_LIMITS[requestKind];
    const windowColumn = requestKind === 'read' ? 'read_window_started_at' : 'proposal_window_started_at';
    const countColumn = requestKind === 'read' ? 'read_request_count' : 'proposal_request_count';
    const windowStart = row[windowColumn] ? new Date(row[windowColumn]).getTime() : 0;
    const activeWindow = Date.now() - windowStart < limit.windowMinutes * 60_000;
    const count = activeWindow ? Number(row[countColumn]) : 0;
    if (count >= limit.requests) {
      await recordAccessEvent(client, row.capability_id, requestKind, 'rate_limited');
      await client.query('COMMIT'); return { access: null, rateLimited: true };
    }
    await client.query(`UPDATE plan_ai_capabilities SET ${windowColumn}=CASE WHEN $2 THEN ${windowColumn} ELSE NOW() END,
      ${countColumn}=CASE WHEN $2 THEN ${countColumn}+1 ELSE 1 END,last_accessed_at=NOW() WHERE id=$1`,
    [row.capability_id, activeWindow]);
    await recordAccessEvent(client, row.capability_id, requestKind, 'granted');
    await client.query('COMMIT');
    return { access: { capabilityId: row.capability_id, planId: row.plan_id, bookingId: row.booking_id,
      protocolVersion: row.protocol_version, scopes: row.scopes }, rateLimited: false };
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

async function recordAccessEvent(client: PoolClient, capabilityId: string, requestKind: string, outcome: string) {
  await client.query(`DELETE FROM plan_ai_access_events WHERE occurred_at < NOW()-INTERVAL '90 days'`);
  await client.query(`INSERT INTO plan_ai_access_events(capability_id,request_kind,outcome) VALUES($1,$2,$3)`,
    [capabilityId, requestKind, outcome]);
}
