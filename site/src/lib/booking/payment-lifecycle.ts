import crypto from 'node:crypto';
import type { PoolClient } from 'pg';
import { getPool } from './db.ts';
import { insertBotBookingMessage } from './messaging.ts';
import { planPaymentTransition, type PaymentTransitionPlan } from './payment-transition.ts';

export type PaymentStage = 'deposit' | 'balance' | 'full_payment';
export type PaymentRecordStatus = 'reported' | 'verified' | 'rejected' | 'cancelled';

export type BookingPayment = {
  id: string;
  publicId: string;
  bookingReference: string;
  offerReference: string | null;
  stage: PaymentStage;
  amountPence: number;
  currency: string;
  method: 'gocardless' | 'stripe' | 'bank_transfer';
  status: PaymentRecordStatus;
  reportedAt: string;
  verifiedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  cancelledAt: string | null;
  decisionByAdminUserId: string | null;
  providerReference: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

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

function normalisePayment(row: Record<string, any>): BookingPayment {
  return {
    id: String(row.id),
    publicId: String(row.publicId),
    bookingReference: String(row.bookingReference),
    offerReference: row.offerReference == null ? null : String(row.offerReference),
    stage: row.stage,
    amountPence: Number(row.amountPence),
    currency: row.currency,
    method: row.method,
    status: row.status,
    reportedAt: new Date(row.reportedAt).toISOString(),
    verifiedAt: row.verifiedAt ? new Date(row.verifiedAt).toISOString() : null,
    rejectedAt: row.rejectedAt ? new Date(row.rejectedAt).toISOString() : null,
    rejectionReason: row.rejectionReason || null,
    cancelledAt: row.cancelledAt ? new Date(row.cancelledAt).toISOString() : null,
    decisionByAdminUserId: row.decisionByAdminUserId == null ? null : String(row.decisionByAdminUserId),
    providerReference: row.providerReference || null,
    metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : {},
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

const paymentSelect = `
  SELECT bp.id::text, bp.public_id::text AS "publicId",
         pb.public_id::text AS "bookingReference",
         bo.public_id::text AS "offerReference",
         bp.stage, bp.amount_pence AS "amountPence", bp.currency, bp.method,
         bp.status, bp.reported_at AS "reportedAt", bp.verified_at AS "verifiedAt",
         bp.rejected_at AS "rejectedAt", bp.rejection_reason AS "rejectionReason",
         bp.cancelled_at AS "cancelledAt",
         bp.decision_by_admin_user_id::text AS "decisionByAdminUserId",
         bp.provider_reference AS "providerReference", bp.metadata,
         bp.created_at AS "createdAt", bp.updated_at AS "updatedAt"
    FROM booking_payments bp
    JOIN provisional_bookings pb ON pb.id = bp.provisional_booking_id
    LEFT JOIN booking_offers bo ON bo.id = bp.booking_offer_id`;

export async function getBookingPaymentHistory(reference: string): Promise<BookingPayment[]> {
  if (!/^[0-9a-f-]{36}$/i.test(reference)) return [];
  const result = await getPool().query(
    paymentSelect + `\nWHERE pb.public_id = $1::uuid\nORDER BY bp.reported_at DESC, bp.id DESC`,
    [reference],
  );
  return result.rows.map(normalisePayment);
}

export async function getReportedBookingPayment(reference: string): Promise<BookingPayment | null> {
  if (!/^[0-9a-f-]{36}$/i.test(reference)) return null;
  const result = await getPool().query(
    paymentSelect + `\nWHERE pb.public_id = $1::uuid AND bp.status = 'reported'\nLIMIT 1`,
    [reference],
  );
  return result.rowCount ? normalisePayment(result.rows[0]) : null;
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

function stageLabel(stage: PaymentStage): string {
  return stage === 'deposit' ? 'deposit' : stage === 'balance' ? 'remaining balance' : 'full payment';
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
              pb.deposit_pence, pb.balance_due_pence,
              COALESCE(NULLIF(pb.pricing_currency, ''), bo.currency, 'GBP') AS currency,
              bo.id AS offer_id
         FROM provisional_bookings pb
         JOIN resolved r ON r.id = pb.id
         LEFT JOIN LATERAL (
           SELECT id, currency FROM booking_offers candidate
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
    const payments = await client.query(
      `SELECT id, public_id::text, stage, status
         FROM booking_payments
        WHERE provisional_booking_id = $1
        FOR UPDATE`,
      [row.id],
    );
    if (payments.rows.some((payment) => payment.status === 'reported')) {
      await client.query('ROLLBACK');
      return 'already_reported';
    }

    const verifiedStages = new Set<PaymentStage>(
      payments.rows.filter((payment) => payment.status === 'verified').map((payment) => payment.stage),
    );
    let stage: PaymentStage;
    let amountPence: number;
    let action: 'report_payment' | 'report_balance_payment';
    if (!verifiedStages.has('deposit') && !verifiedStages.has('full_payment')) {
      stage = Number(row.balance_due_pence || 0) > 0 ? 'deposit' : 'full_payment';
      amountPence = Number(row.deposit_pence || 0);
      action = 'report_payment';
    } else if (
      verifiedStages.has('deposit')
      && Number(row.balance_due_pence || 0) > 0
      && !verifiedStages.has('balance')
    ) {
      stage = 'balance';
      amountPence = Number(row.balance_due_pence);
      action = 'report_balance_payment';
    } else {
      await client.query('ROLLBACK');
      return 'payment_not_due';
    }
    if (amountPence <= 0) {
      await client.query('ROLLBACK');
      return 'payment_not_due';
    }

    let plan: PaymentTransitionPlan;
    try {
      plan = planPaymentTransition({ status: row.status, action, actor: 'booker' });
    } catch {
      await client.query('ROLLBACK');
      return 'payment_not_due';
    }

    const inserted = await client.query(
      `INSERT INTO booking_payments (
         provisional_booking_id, booking_offer_id, stage, amount_pence,
         currency, method, status
       ) VALUES ($1, $2, $3, $4, $5, 'bank_transfer', 'reported')
       RETURNING id, public_id::text AS public_id`,
      [row.id, row.offer_id, stage, amountPence, row.currency],
    );
    const payment = inserted.rows[0];

    if (stage !== 'balance') {
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
    }

    await insertActivity(client, {
      bookingId: row.id,
      offerId: row.offer_id,
      actor: 'customer',
      eventType: plan.activityEvent,
      details: {
        confirmationBasis: 'booker_reported_sent',
        paymentId: payment.public_id,
        paymentMethod: 'bank_transfer',
        paymentStage: stage,
        amountPence,
        currency: row.currency,
        lifecycleRule: `${plan.from}.${plan.action}.${plan.actor}`,
      },
    });
    await insertBotBookingMessage(client, {
      bookingId: row.id,
      offerId: row.offer_id,
      body: `The Booker has reported that the ${stageLabel(stage)} was sent by manual bank transfer. Verify the transfer against the bank account${stage === 'balance' ? '; the booking remains confirmed while verification is pending' : ' before confirming the booking'}.`,
      audience: 'administrator',
      sourceKey: `payment-reported-admin:${payment.public_id}`,
    });
    await insertBotBookingMessage(client, {
      bookingId: row.id,
      offerId: row.offer_id,
      body: `${stage === 'balance' ? 'Remaining balance' : stage === 'deposit' ? 'Deposit' : 'Full payment'} reported. Olrig Bank will verify the bank transfer${stage === 'balance' ? '; your booking remains confirmed' : ' before confirming your booking'}.`,
      audience: 'booker',
      sourceKey: `payment-reported-booker:${payment.public_id}`,
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

export async function verifyReportedPayment(
  reference: string,
  paymentReference: string,
  adminUserId?: string | number | null,
): Promise<AdministratorPaymentDecisionResult> {
  if (!/^[0-9a-f-]{36}$/i.test(reference) || !/^[0-9a-f-]{36}$/i.test(paymentReference)) return 'not_found';
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const selected = await client.query(
      `SELECT pb.id, pb.status, bp.id AS payment_id, bp.public_id::text AS payment_reference,
              bp.stage, bp.status AS payment_status, bp.amount_pence, bp.currency,
              bp.booking_offer_id AS offer_id
         FROM provisional_bookings pb
         JOIN booking_payments bp ON bp.provisional_booking_id = pb.id
        WHERE pb.public_id = $1::uuid AND bp.public_id = $2::uuid
        FOR UPDATE OF pb, bp`,
      [reference, paymentReference],
    );
    if (!selected.rowCount) {
      await client.query('ROLLBACK');
      return 'not_found';
    }

    const row = selected.rows[0];
    if (row.payment_status !== 'reported') {
      await client.query('ROLLBACK');
      return 'transition_not_allowed';
    }
    const action = row.stage === 'balance' ? 'verify_balance_payment' : 'verify_payment';
    let plan: PaymentTransitionPlan;
    try {
      plan = planPaymentTransition({ status: row.status, action, actor: 'administrator' });
    } catch {
      await client.query('ROLLBACK');
      return 'transition_not_allowed';
    }

    const decided = await client.query(
      `UPDATE booking_payments
          SET status = 'verified', verified_at = NOW(),
              decision_by_admin_user_id = $2, updated_at = NOW()
        WHERE id = $1 AND status = 'reported'
      RETURNING id`,
      [row.payment_id, adminUserId || null],
    );
    if (!decided.rowCount) {
      await client.query('ROLLBACK');
      return 'transition_not_allowed';
    }

    if (row.stage !== 'balance') {
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
    }

    await insertActivity(client, {
      bookingId: row.id,
      offerId: row.offer_id,
      actor: 'administrator',
      eventType: plan.activityEvent,
      details: {
        confirmationBasis: 'administrator_verified_bank_account',
        paymentId: row.payment_reference,
        paymentMethod: 'bank_transfer',
        paymentStage: row.stage,
        amountPence: Number(row.amount_pence),
        currency: row.currency,
        lifecycleRule: `${plan.from}.${plan.action}.${plan.actor}`,
      },
    });
    await insertBotBookingMessage(client, {
      bookingId: row.id,
      offerId: row.offer_id,
      body: row.stage === 'balance'
        ? 'The remaining-balance payment has been verified against the bank account. The booking is confirmed and fully paid.'
        : `The reported ${stageLabel(row.stage)} has been verified against the bank account. The direct booking is now confirmed${row.stage === 'full_payment' ? ' and fully paid' : ''}.`,
      audience: 'both',
      sourceKey: `payment-verified:${row.payment_reference}`,
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
  paymentReference: string,
  reason: string,
  adminUserId?: string | number | null,
): Promise<AdministratorPaymentDecisionResult> {
  if (!/^[0-9a-f-]{36}$/i.test(reference) || !/^[0-9a-f-]{36}$/i.test(paymentReference)) return 'not_found';
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const selected = await client.query(
      `SELECT pb.id, pb.status, bp.id AS payment_id, bp.public_id::text AS payment_reference,
              bp.stage, bp.status AS payment_status, bp.amount_pence, bp.currency,
              bp.booking_offer_id AS offer_id
         FROM provisional_bookings pb
         JOIN booking_payments bp ON bp.provisional_booking_id = pb.id
        WHERE pb.public_id = $1::uuid AND bp.public_id = $2::uuid
        FOR UPDATE OF pb, bp`,
      [reference, paymentReference],
    );
    if (!selected.rowCount) {
      await client.query('ROLLBACK');
      return 'not_found';
    }

    const row = selected.rows[0];
    if (row.payment_status !== 'reported') {
      await client.query('ROLLBACK');
      return 'transition_not_allowed';
    }
    const action = row.stage === 'balance' ? 'reject_balance_payment_report' : 'reject_payment_report';
    let plan: PaymentTransitionPlan;
    try {
      plan = planPaymentTransition({ status: row.status, action, actor: 'administrator', reason });
    } catch (error) {
      if (error instanceof Error && error.message === 'PAYMENT_REJECTION_REASON_REQUIRED') throw error;
      await client.query('ROLLBACK');
      return 'transition_not_allowed';
    }

    const decided = await client.query(
      `UPDATE booking_payments
          SET status = 'rejected', rejected_at = NOW(), rejection_reason = $2,
              decision_by_admin_user_id = $3, updated_at = NOW()
        WHERE id = $1 AND status = 'reported'
      RETURNING id`,
      [row.payment_id, plan.reason, adminUserId || null],
    );
    if (!decided.rowCount) {
      await client.query('ROLLBACK');
      return 'transition_not_allowed';
    }

    if (row.stage !== 'balance') {
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
    }

    await insertActivity(client, {
      bookingId: row.id,
      offerId: row.offer_id,
      actor: 'administrator',
      eventType: plan.activityEvent,
      details: {
        reason: plan.reason,
        paymentId: row.payment_reference,
        paymentMethod: 'bank_transfer',
        paymentStage: row.stage,
        amountPence: Number(row.amount_pence),
        currency: row.currency,
        lifecycleRule: `${plan.from}.${plan.action}.${plan.actor}`,
      },
    });
    await insertBotBookingMessage(client, {
      bookingId: row.id,
      offerId: row.offer_id,
      body: row.stage === 'balance'
        ? `The reported remaining-balance transfer could not be verified. Reason: ${plan.reason} Your booking remains confirmed, and you can report the balance again after reviewing the details.`
        : `The reported bank transfer could not be verified. Reason: ${plan.reason} Please review the details and contact Olrig Bank in this conversation before reporting payment again.`,
      audience: 'booker',
      sourceKey: `payment-report-rejected-booker:${row.payment_reference}`,
    });
    await insertBotBookingMessage(client, {
      bookingId: row.id,
      offerId: row.offer_id,
      body: row.stage === 'balance'
        ? `The balance payment report was rejected; the booking remains confirmed. Reason: ${plan.reason}`
        : `The payment report was rejected and the booking was returned to payment required. Reason: ${plan.reason}`,
      audience: 'administrator',
      sourceKey: `payment-report-rejected-admin:${row.payment_reference}`,
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
