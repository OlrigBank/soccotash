import crypto from 'node:crypto';
import type { Pool } from 'pg';
import { getPool } from '../booking/db.ts';
import { bookingAccessState, getBookingAccessExpiryDays } from '../booking/booking-access-policy.ts';
import type { ParticipantRole } from './types.ts';

const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const tokenHash = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

export type ParticipantAccess = {
  participantId: string;
  planId: string;
  bookingId: string;
  displayName: string;
  role: Exclude<ParticipantRole, 'owner'>;
};

export function createParticipantCredential(): { token: string; hash: string } {
  const token = crypto.randomBytes(32).toString('base64url');
  return { token, hash: tokenHash(token) };
}

export async function resolveParticipantCredential(
  token: string,
  recordUse = false,
  database: Pick<Pool, 'query'> = getPool(),
): Promise<ParticipantAccess | null> {
  if (!tokenPattern.test(token)) return null;
  const result = await database.query<any>(
    `SELECT pp.id::text AS participant_id, hp.public_id::text AS plan_id,
            pp.booking_id::text, pp.display_name, pp.role, pb.departure::text,
            pb.customer_access_token_revoked_at AS booking_access_revoked_at
       FROM plan_participants pp
       JOIN holiday_plans hp ON hp.id = pp.holiday_plan_id
       JOIN provisional_bookings pb ON pb.id = pp.booking_id
      WHERE pp.access_token_hash = $1 AND pp.participant_type = 'guest'
        AND pp.revoked_at IS NULL AND hp.archived_at IS NULL AND hp.deletion_requested_at IS NULL
        AND pb.deletion_requested_at IS NULL`,
    [tokenHash(token)],
  );
  if (!result.rowCount) return null;
  if (bookingAccessState({
    departure: result.rows[0].departure,
    revokedAt: result.rows[0].booking_access_revoked_at,
    expiryDays: getBookingAccessExpiryDays(),
  }) !== 'active') return null;
  if (recordUse) {
    await database.query(
      `UPDATE plan_participants
          SET accepted_at = COALESCE(accepted_at, NOW()), last_accessed_at = NOW()
        WHERE id = $1`,
      [result.rows[0].participant_id],
    );
  }
  return {
    participantId: result.rows[0].participant_id,
    planId: result.rows[0].plan_id,
    bookingId: result.rows[0].booking_id,
    displayName: result.rows[0].display_name,
    role: result.rows[0].role,
  };
}
