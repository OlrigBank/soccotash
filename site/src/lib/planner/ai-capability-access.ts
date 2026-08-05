import crypto from 'node:crypto';
import type { Pool } from 'pg';
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
        AND hp.plan_type = 'booking_linked' AND hp.archived_at IS NULL`,
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
