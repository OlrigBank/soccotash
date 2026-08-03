import type { PoolClient } from 'pg';
import { getPool } from './db.ts';
import { assertBookingTransitionAllowed } from './lifecycle.ts';
import { insertBotBookingMessage } from './messaging.ts';
import { resolveBookingAccessCredential } from './booking-access.ts';

export type CancelBookingResult =
  | 'cancelled'
  | 'reason_required'
  | 'transition_not_allowed'
  | 'not_found';

async function insertCancellationActivity(
  client: PoolClient,
  input: {
    bookingId: string | number;
    offerId?: string | number | null;
    reason: string;
    lifecycleRule: string;
    actor: 'administrator' | 'customer';
  },
): Promise<void> {
  await client.query(
    `INSERT INTO booking_activity
       (provisional_booking_id, booking_offer_id, actor, event_type, details)
     VALUES ($1, $2, $3, 'booking_cancelled', $4::jsonb)`,
    [
      input.bookingId,
      input.offerId || null,
      input.actor,
      JSON.stringify({
        reason: input.reason,
        lifecycleRule: input.lifecycleRule,
      }),
    ],
  );
}

async function cancelBookingForActor(
  reference: string,
  reasonInput: string,
  actor: 'administrator' | 'booker',
): Promise<CancelBookingResult> {
  if (!/^[0-9a-f-]{36}$/i.test(reference)) return 'not_found';
  const reason = reasonInput.trim().slice(0, 1000);
  if (!reason) return 'reason_required';

  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const selected = await client.query(
      `SELECT pb.id, pb.status, bo.id AS offer_id
         FROM provisional_bookings pb
         LEFT JOIN LATERAL (
           SELECT id
             FROM booking_offers candidate
            WHERE candidate.provisional_booking_id = pb.id
              AND candidate.published_at IS NOT NULL
            ORDER BY candidate.published_at DESC, candidate.id DESC
            LIMIT 1
         ) bo ON TRUE
        WHERE pb.public_id = $1::uuid
        FOR UPDATE OF pb`,
      [reference],
    );
    if (!selected.rowCount) {
      await client.query('ROLLBACK');
      return 'not_found';
    }

    const row = selected.rows[0];
    let decision;
    try {
      decision = assertBookingTransitionAllowed({
        status: row.status,
        action: 'cancel_booking',
        actor,
      });
    } catch {
      await client.query('ROLLBACK');
      return 'transition_not_allowed';
    }

    const updated = await client.query(
      `UPDATE provisional_bookings
          SET status = $2
        WHERE id = $1
          AND status = $3
      RETURNING id`,
      [row.id, decision.nextStatus, row.status],
    );
    if (!updated.rowCount) {
      await client.query('ROLLBACK');
      return 'transition_not_allowed';
    }

    await client.query(
      `UPDATE booking_payments
          SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
        WHERE provisional_booking_id = $1 AND status = 'reported'`,
      [row.id],
    );

    await insertCancellationActivity(client, {
      bookingId: row.id,
      offerId: row.offer_id,
      reason,
      lifecycleRule: decision.rule.id,
      actor: actor === 'booker' ? 'customer' : 'administrator',
    });
    await insertBotBookingMessage(client, {
      bookingId: row.id,
      offerId: row.offer_id,
      body: actor === 'booker'
        ? `The Booker cancelled this booking. Reason: ${reason} The conversation remains available as the permanent record.`
        : `Olrig Bank cancelled this booking. Reason: ${reason} The conversation remains available as the permanent record.`,
      audience: 'both',
      sourceKey: `booking-cancelled:${row.id}`,
    });
    await client.query('COMMIT');
    return 'cancelled';
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function cancelBooking(
  reference: string,
  reasonInput: string,
): Promise<CancelBookingResult> {
  return cancelBookingForActor(reference, reasonInput, 'administrator');
}

export async function cancelBookingByBookerToken(
  token: string,
  reasonInput: string,
): Promise<CancelBookingResult> {
  const access = await resolveBookingAccessCredential(token);
  if (!access.allowed) return 'not_found';
  return cancelBookingForActor(access.reference, reasonInput, 'booker');
}
