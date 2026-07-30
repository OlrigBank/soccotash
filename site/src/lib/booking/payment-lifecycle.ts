import crypto from 'node:crypto';
import type { PoolClient } from 'pg';
import { getPool } from './db';
import { insertBotBookingMessage } from './messaging';
import { planPaymentTransition, type PaymentTransitionPlan } from './payment-transition';

export type ReportManualBankTransferResult =
  | 'payment_reported'
  | 'already_reported'
  | 'payment_not_due'
  | 'not_found';

export type AdministratorPaymentDecisionResult =
  | 'verified'
  | 'rejected'
  | 'transition_not_allowed'
  | 'not_found';

function validAccessToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43,128}$/.test(token);
}

function accessTokenHash(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function insertActivity(
  client: PoolClient,
  input: {
    bookingId: string | number;
    offerId?: string | number | null;
    actor: 'customer' | 'administrator';
    eventType: string;
    details: Record<string, unknown>;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO booking_activity
       (provisional_booking_id, booking_offer_id, actor, event_type, details)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [input.bookingId, input.offerId || null, input.actor, input.eventType, JSON.stringify(input.details)],
  );
}

export async function reportManualBankTransfer(token: string): Promise<ReportManualBankTransferResult> {
  if (!validAccessToken(token)) return 'not_found';
  const tokenHash = accessTokenHash(token);
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const selected = await client.query(
      `WITH resolved AS (
         SELECT id FROM provisional_bookings WHERE customer_access_token = $1
         UNION
         SELECT provisional_booking_id FROM booking_offers WHERE access_token_hash = $2
       )
       SELECT pb.id, pb.status, pb.public_id::text AS booking_reference,
              pb.balance_due_pence, bo.id AS offer_id
         FROM provisional_bookings pb
         JOIN resolved r ON r.id = pb.id
         LEFT JOIN LATERAL (
           SELECT id FROM booking_offers candidate
            WHERE candidate.provisional_booking_id = pb.id
              AND candidate.customer_status = 'accepted'
            ORDER BY candidate.id DESC LIMIT 1
         ) bo ON TRUE
        FOR UPDATE OF pb`,
      [token, tokenHash],
    );
    if (!selected.rowCount) {
      await client.query('ROLLBACK');
      return 'not_found';
    }

    const row = selected.rows[0];
    if (row.status === 'payment_reported') {
      await client.query('ROLLBACK');
      return 'already_reported';
    }

    let plan: PaymentTransitionPlan;
    try {
      plan = planPaymentTransition({ status: row.status, action: 'report_payment', actor: 'booker' });
    } catch {
      await client.query('ROLLBACK');
      return 'payment_not_due';
    }
    const paymentStage = Number(row.balance_due_pence || 0) > 0 ? 'deposit' : 'full_payment';
    const paymentLabel = paymentStage === 'deposit' ? 'deposit' : 'full payment';

    const updated = await client.query(
      `UPDATE provisional_bookings
          SET status = $2,
              payment_method = 'bank_transfer',
              payment_reported_at = NOW(),
              payment_received_at = NULL,
              confirmed_at = NULL
        WHERE id = $1 AND status = $3
      RETURNING id`,
      [row.id, plan.to, plan.from],
    );
    if (!updated.rowCount) {
      await client.query('ROLLBACK');
      return 'payment_not_due';
    }

    await insertActivity(client, {
      bookingId: row.id,
      offerId: row.offer_id,
      actor: 'customer',
      eventType: plan.activityEvent,
      details: {
        confirmationBasis: 'booker_reported_sent',
        paymentMethod: 'bank_transfer',
        paymentStage,
        lifecycleRule: `${plan.from}.${plan.action}.${plan.actor}`,
      },
    });
    await insertBotBookingMessage(client, {
      bookingId: row.id,
      offerId: row.offer_id,
      body: `The Booker has reported that the ${paymentLabel} was sent by manual bank transfer. Verify the transfer against the bank account before confirming the booking.`,
      audience: 'administrator',
      sourceKey: `payment-reported-admin:${row.id}`,
    });
    await insertBotBookingMessage(client, {
      bookingId: row.id,
      offerId: row.offer_id,
      body: `${paymentStage === 'deposit' ? 'Deposit' : 'Full'} payment reported. Olrig Bank will verify the bank transfer before confirming your booking.`,
      audience: 'booker',
      sourceKey: `payment-reported-booker:${row.id}`,
    });
    await client.query('COMMIT');
    return 'payment_reported';
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function verifyReportedPayment(reference: string): Promise<AdministratorPaymentDecisionResult> {
  if (!/^[0-9a-f-]{36}$/i.test(reference)) return 'not_found';
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const selected = await client.query(
      `SELECT pb.id, pb.status, bo.id AS offer_id
         FROM provisional_bookings pb
         LEFT JOIN LATERAL (
           SELECT id FROM booking_offers candidate
            WHERE candidate.provisional_booking_id = pb.id
              AND candidate.customer_status = 'accepted'
            ORDER BY candidate.id DESC LIMIT 1
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
    let plan: PaymentTransitionPlan;
    try {
      plan = planPaymentTransition({ status: row.status, action: 'verify_payment', actor: 'administrator' });
    } catch {
      await client.query('ROLLBACK');
      return 'transition_not_allowed';
    }

    const updated = await client.query(
      `UPDATE provisional_bookings
          SET status = $2,
              payment_received_at = NOW(),
              confirmed_at = COALESCE(confirmed_at, NOW())
        WHERE id = $1 AND status = $3
      RETURNING id`,
      [row.id, plan.to, plan.from],
    );
    if (!updated.rowCount) {
      await client.query('ROLLBACK');
      return 'transition_not_allowed';
    }

    await insertActivity(client, {
      bookingId: row.id,
      offerId: row.offer_id,
      actor: 'administrator',
      eventType: plan.activityEvent,
      details: {
        confirmationBasis: 'administrator_verified_bank_account',
        paymentMethod: 'bank_transfer',
        lifecycleRule: `${plan.from}.${plan.action}.${plan.actor}`,
      },
    });
    await insertBotBookingMessage(client, {
      bookingId: row.id,
      offerId: row.offer_id,
      body: 'The reported initial payment has been verified against the bank account. The direct booking is now confirmed.',
      audience: 'both',
      sourceKey: `payment-verified:${row.id}`,
    });
    await client.query('COMMIT');
    return 'verified';
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function rejectReportedPayment(
  reference: string,
  reason: string,
): Promise<AdministratorPaymentDecisionResult> {
  if (!/^[0-9a-f-]{36}$/i.test(reference)) return 'not_found';
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const selected = await client.query(
      `SELECT pb.id, pb.status, bo.id AS offer_id
         FROM provisional_bookings pb
         LEFT JOIN LATERAL (
           SELECT id FROM booking_offers candidate
            WHERE candidate.provisional_booking_id = pb.id
              AND candidate.customer_status = 'accepted'
            ORDER BY candidate.id DESC LIMIT 1
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
    let plan: PaymentTransitionPlan;
    try {
      plan = planPaymentTransition({
        status: row.status,
        action: 'reject_payment_report',
        actor: 'administrator',
        reason,
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'PAYMENT_REJECTION_REASON_REQUIRED') throw error;
      await client.query('ROLLBACK');
      return 'transition_not_allowed';
    }

    const updated = await client.query(
      `UPDATE provisional_bookings
          SET status = $2,
              payment_method = NULL,
              payment_reported_at = NULL,
              payment_received_at = NULL,
              confirmed_at = NULL
        WHERE id = $1 AND status = $3
      RETURNING id`,
      [row.id, plan.to, plan.from],
    );
    if (!updated.rowCount) {
      await client.query('ROLLBACK');
      return 'transition_not_allowed';
    }

    await insertActivity(client, {
      bookingId: row.id,
      offerId: row.offer_id,
      actor: 'administrator',
      eventType: plan.activityEvent,
      details: {
        reason: plan.reason,
        paymentMethod: 'bank_transfer',
        lifecycleRule: `${plan.from}.${plan.action}.${plan.actor}`,
      },
    });
    await insertBotBookingMessage(client, {
      bookingId: row.id,
      offerId: row.offer_id,
      body: `The reported bank transfer could not be verified. Reason: ${plan.reason} Please review the details and contact Olrig Bank in this conversation before reporting payment again.`,
      audience: 'booker',
      sourceKey: `payment-report-rejected-booker:${row.id}:${Date.now()}`,
    });
    await insertBotBookingMessage(client, {
      bookingId: row.id,
      offerId: row.offer_id,
      body: `The payment report was rejected and the booking was returned to payment required. Reason: ${plan.reason}`,
      audience: 'administrator',
      sourceKey: `payment-report-rejected-admin:${row.id}:${Date.now()}`,
    });
    await client.query('COMMIT');
    return 'rejected';
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
