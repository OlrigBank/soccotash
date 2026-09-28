import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { currentBookerAccountId } from '../booker/context.ts';
import { getPool } from './db.ts';
import { resolveBookingAccessCredential } from './booking-access.ts';
import { assertBookingTransitionAllowed } from './lifecycle.ts';
import { insertBotBookingMessage } from './messaging.ts';
import type { PaymentStage } from './payment-lifecycle.ts';

type CheckoutAttempt = {
  id: string; status: string; stripeSessionId: string | null; stripeCheckoutUrl: string | null;
  stage: PaymentStage; amountPence: number; currency: string;
};

export function bankTransferDetails() {
  const payee = process.env.BOOKING_BANK_PAYEE?.trim() || '';
  const sortCode = process.env.BOOKING_BANK_SORT_CODE?.trim() || '';
  const accountNumber = process.env.BOOKING_BANK_ACCOUNT_NUMBER?.trim() || '';
  return payee && /^\d{2}-?\d{2}-?\d{2}$/.test(sortCode) && /^\d{8}$/.test(accountNumber)
    ? { payee, sortCode, accountNumber } : null;
}

export function stripeAvailable() {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
}

async function stripePost(path: string, body: URLSearchParams, idempotencyKey?: string) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_NOT_CONFIGURED');
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/x-www-form-urlencoded',
      ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
    },
    body,
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json() as Record<string, any>;
  if (!response.ok) throw new Error(`STRIPE_REQUEST_FAILED:${response.status}:${String(result.error?.code || 'unknown')}`);
  return result;
}

export async function activeCheckoutAttempt(bookingReference: string): Promise<CheckoutAttempt | null> {
  const result = await getPool().query(
    `SELECT id::text, status, stripe_session_id AS "stripeSessionId", stripe_checkout_url AS "stripeCheckoutUrl",
            stage, amount_pence AS "amountPence", currency
       FROM booking_checkout_attempts
      WHERE provisional_booking_id = (SELECT id FROM provisional_bookings WHERE public_id = $1::uuid)
        AND status IN ('creating', 'open')
      ORDER BY created_at DESC LIMIT 1`,
    [bookingReference],
  );
  return result.rows[0] || null;
}

export async function listCheckoutAttempts(bookingReference: string): Promise<Array<{
  id: string; stage: PaymentStage; amountPence: number; currency: string; status: string;
  stripeSessionId: string | null; stripePaymentIntentId: string | null; createdAt: string;
}>> {
  const result = await getPool().query(
    `SELECT id::text, stage, amount_pence AS "amountPence", currency, status,
            stripe_session_id AS "stripeSessionId", stripe_payment_intent_id AS "stripePaymentIntentId",
            created_at AS "createdAt"
       FROM booking_checkout_attempts
      WHERE provisional_booking_id = (SELECT id FROM provisional_bookings WHERE public_id = $1::uuid)
      ORDER BY created_at DESC`, [bookingReference],
  );
  return result.rows.map((row) => ({ ...row, amountPence: Number(row.amountPence), createdAt: new Date(row.createdAt).toISOString() }));
}

export async function startCardCheckout(token: string, publicOrigin: string): Promise<{ url?: string; error?: string }> {
  if (!stripeAvailable()) return { error: 'Card payment is temporarily unavailable.' };
  if (!(await resolveBookingAccessCredential(token)).allowed) return { error: 'Booking not found.' };
  const accountId = currentBookerAccountId();
  const client = await getPool().connect();
  let attempt: CheckoutAttempt & { bookingReference: string; customerReference: string; guestEmail: string };
  try {
    await client.query('BEGIN');
    const selected = await client.query(
      `SELECT pb.id, pb.public_id::text AS "bookingReference", pb.customer_reference AS "customerReference",
              pb.guest_email AS "guestEmail", pb.status, pb.deposit_pence, pb.balance_due_pence,
              bo.id AS offer_id, bo.currency
         FROM provisional_bookings pb
         JOIN booking_offers bo ON bo.provisional_booking_id = pb.id AND bo.customer_status = 'accepted'
        WHERE pb.public_id::text = $1 AND pb.booker_account_id = $2::uuid AND pb.deletion_requested_at IS NULL
        ORDER BY bo.id DESC LIMIT 1 FOR UPDATE OF pb`,
      [token, accountId],
    );
    if (!selected.rowCount) { await client.query('ROLLBACK'); return { error: 'Accept the current offer before paying.' }; }
    const row = selected.rows[0];
    const paymentRows = await client.query(
      `SELECT stage, status FROM booking_payments WHERE provisional_booking_id = $1 FOR UPDATE`, [row.id],
    );
    if (paymentRows.rows.some((payment) => payment.status === 'reported')) {
      await client.query('ROLLBACK'); return { error: 'A bank transfer is awaiting verification.' };
    }
    const verified = new Set(paymentRows.rows.filter((payment) => payment.status === 'verified').map((payment) => payment.stage));
    const stage: PaymentStage = verified.has('deposit') && !verified.has('balance') && Number(row.balance_due_pence) > 0
      ? 'balance' : Number(row.balance_due_pence) > 0 ? 'deposit' : 'full_payment';
    const amountPence = stage === 'balance' ? Number(row.balance_due_pence) : Number(row.deposit_pence);
    const expectedStatus = stage === 'balance' ? 'confirmed' : 'payment_pending';
    if (row.status !== expectedStatus || verified.has(stage) || verified.has('full_payment') || amountPence <= 0) {
      await client.query('ROLLBACK'); return { error: 'No card payment is due for this booking.' };
    }
    const existing = await client.query(
      `SELECT id::text, status, stripe_session_id AS "stripeSessionId", stripe_checkout_url AS "stripeCheckoutUrl",
              stage, amount_pence AS "amountPence", currency, created_at
         FROM booking_checkout_attempts WHERE provisional_booking_id = $1 AND status IN ('creating', 'open')
         FOR UPDATE`, [row.id],
    );
    if (existing.rowCount && existing.rows[0].status === 'open' && existing.rows[0].stripeCheckoutUrl) {
      await client.query('ROLLBACK'); return { url: existing.rows[0].stripeCheckoutUrl };
    }
    if (existing.rowCount && Date.now() - new Date(existing.rows[0].created_at).getTime() < 30000) {
      await client.query('ROLLBACK'); return { error: 'Checkout is starting. Please try again shortly.' };
    }
    const attemptId = existing.rows[0]?.id || randomUUID();
    if (!existing.rowCount) await client.query(
      `INSERT INTO booking_checkout_attempts
         (id, provisional_booking_id, booking_offer_id, stage, amount_pence, currency, status)
       VALUES ($1::uuid, $2, $3, $4, $5, $6, 'creating')`,
      [attemptId, row.id, row.offer_id, stage, amountPence, row.currency],
    );
    await client.query('COMMIT');
    attempt = { id: attemptId, status: 'creating', stripeSessionId: null, stripeCheckoutUrl: null,
      stage, amountPence, currency: row.currency, bookingReference: row.bookingReference,
      customerReference: row.customerReference, guestEmail: row.guestEmail || '' };
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
  finally { client.release(); }

  try {
    const successUrl = new URL(`/booking/manage/${token}/payment/?checkout=returned`, publicOrigin).toString();
    const cancelUrl = new URL(`/booking/manage/${token}/payment/?checkout=cancelled`, publicOrigin).toString();
    const body = new URLSearchParams({
      mode: 'payment', 'payment_method_types[0]': 'card',
      success_url: successUrl, cancel_url: cancelUrl,
      client_reference_id: attempt.bookingReference,
      'line_items[0][price_data][currency]': attempt.currency.toLowerCase(),
      'line_items[0][price_data][unit_amount]': String(attempt.amountPence),
      'line_items[0][price_data][product_data][name]': `Olrig Bank ${attempt.stage === 'balance' ? 'remaining balance' : attempt.stage === 'deposit' ? 'deposit' : 'booking payment'} · ${attempt.customerReference}`,
      'line_items[0][quantity]': '1',
      'metadata[checkout_attempt_id]': attempt.id,
      'metadata[booking_reference]': attempt.bookingReference,
    });
    if (attempt.guestEmail) body.set('customer_email', attempt.guestEmail);
    const session = await stripePost('checkout/sessions', body, `booking-checkout:${attempt.id}`);
    if (typeof session.id !== 'string' || typeof session.url !== 'string') throw new Error('STRIPE_SESSION_INCOMPLETE');
    const saved = await getPool().query(
      `UPDATE booking_checkout_attempts SET status = 'open', stripe_session_id = $2,
              stripe_checkout_url = $3, updated_at = NOW()
        WHERE id = $1::uuid AND status = 'creating'`,
      [attempt.id, session.id, session.url],
    );
    if (!saved.rowCount) {
      await stripePost(`checkout/sessions/${encodeURIComponent(session.id)}/expire`, new URLSearchParams(), `expire-checkout:${attempt.id}`).catch(() => {});
      return { error: 'Payment method changed while checkout was starting. Please refresh the page.' };
    }
    return { url: session.url };
  } catch (error) {
    // A timed-out Stripe request may still have created a session. Retain the
    // attempt so a retry uses the same provider idempotency key.
    if (error instanceof Error && /^STRIPE_REQUEST_FAILED:4(?!09)/.test(error.message)) {
      await getPool().query(`UPDATE booking_checkout_attempts SET status = 'failed', updated_at = NOW()
        WHERE id = $1::uuid AND status = 'creating'`, [attempt.id]).catch(() => {});
    }
    console.error('Could not start Stripe checkout:', error instanceof Error ? error.message : 'unknown error');
    return { error: 'Card checkout could not start. Please try again shortly.' };
  }
}

export async function switchToBankTransfer(token: string): Promise<string | null> {
  if (!(await resolveBookingAccessCredential(token)).allowed) return 'Booking not found.';
  const accountId = currentBookerAccountId();
  const result = await getPool().query(
    `SELECT bca.id::text, bca.stripe_session_id AS "sessionId", bca.status, bca.created_at AS "createdAt"
       FROM booking_checkout_attempts bca
       JOIN provisional_bookings pb ON pb.id = bca.provisional_booking_id
      WHERE pb.public_id::text = $1 AND pb.booker_account_id = $2::uuid
        AND bca.status IN ('creating', 'open')`, [token, accountId],
  );
  if (!result.rowCount) return null;
  const attempt = result.rows[0];
  if (!attempt.sessionId) {
    if (Date.now() - new Date(attempt.createdAt).getTime() < 30000) return 'Checkout is starting. Please try again shortly.';
    await getPool().query(`UPDATE booking_checkout_attempts SET status = 'failed', updated_at = NOW()
      WHERE id = $1::uuid AND status = 'creating' AND stripe_session_id IS NULL`, [attempt.id]);
    return null;
  }
  try {
    await stripePost(`checkout/sessions/${encodeURIComponent(attempt.sessionId)}/expire`, new URLSearchParams(), `expire-checkout:${attempt.id}`);
    await getPool().query(`UPDATE booking_checkout_attempts SET status = 'expired', updated_at = NOW() WHERE id = $1::uuid AND status = 'open'`, [attempt.id]);
    return null;
  } catch {
    return 'Card checkout may have completed. Please refresh your reservation before changing payment method.';
  }
}

export function verifyStripeEvent(payload: string, signature: string | null): Record<string, any> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !signature) throw new Error('INVALID_STRIPE_SIGNATURE');
  const parts = signature.split(',').map((part) => part.split('=', 2));
  const timestamp = Number(parts.find(([name]) => name === 't')?.[1]);
  if (!Number.isSafeInteger(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > 300) throw new Error('INVALID_STRIPE_SIGNATURE');
  const expected = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  const valid = parts.filter(([name]) => name === 'v1').some(([, provided = '']) =>
    provided.length === expected.length && timingSafeEqual(Buffer.from(expected), Buffer.from(provided)));
  if (!valid) throw new Error('INVALID_STRIPE_SIGNATURE');
  return JSON.parse(payload) as Record<string, any>;
}

export async function recordPaidCheckout(session: Record<string, any>): Promise<{ result: 'recorded' | 'duplicate' | 'refund_required'; bookingReference?: string; stage?: PaymentStage; amountPence?: number; currency?: string }> {
  if (session.object !== 'checkout.session' || session.payment_status !== 'paid' || typeof session.id !== 'string') throw new Error('STRIPE_SESSION_NOT_PAID');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const identity = await client.query(`SELECT provisional_booking_id FROM booking_checkout_attempts WHERE stripe_session_id = $1`, [session.id]);
    if (!identity.rowCount) throw new Error('UNKNOWN_STRIPE_SESSION');
    const booking = await client.query(`SELECT id, public_id::text AS reference, status, deposit_pence, balance_due_pence
      FROM provisional_bookings WHERE id = $1 FOR UPDATE`, [identity.rows[0].provisional_booking_id]);
    const attemptResult = await client.query(`SELECT * FROM booking_checkout_attempts WHERE stripe_session_id = $1 FOR UPDATE`, [session.id]);
    const attempt = attemptResult.rows[0];
    if (attempt.status === 'completed' || attempt.status === 'refunded') { await client.query('ROLLBACK'); return { result: 'duplicate' }; }
    const sessionMatches = Number(session.amount_total) === Number(attempt.amount_pence)
      && String(session.currency).toUpperCase() === attempt.currency
      && session.client_reference_id === booking.rows[0].reference;
    const existing = await client.query(`SELECT stage, status FROM booking_payments WHERE provisional_booking_id = $1 FOR UPDATE`, [booking.rows[0].id]);
    const paid = existing.rows.some((payment) => payment.stage === attempt.stage && payment.status === 'verified');
    const reported = existing.rows.some((payment) => payment.status === 'reported');
    const allowedStatus = attempt.stage === 'balance' ? 'confirmed' : 'payment_pending';
    const depositVerified = existing.rows.some((payment) => payment.stage === 'deposit' && payment.status === 'verified');
    const valid = sessionMatches && booking.rows[0].status === allowedStatus && !paid && !reported
      && (attempt.stage !== 'balance' || depositVerified) && attempt.status === 'open';
    if (!valid) {
      await client.query(`UPDATE booking_checkout_attempts SET status = 'refund_required', stripe_payment_intent_id = $2, updated_at = NOW() WHERE id = $1`, [attempt.id, session.payment_intent || null]);
      await client.query(`INSERT INTO booking_activity (provisional_booking_id, booking_offer_id, actor, event_type, details)
        VALUES ($1, $2, 'system', 'card_payment_refund_required', $3::jsonb)`,
        [booking.rows[0].id, attempt.booking_offer_id, JSON.stringify({ checkoutAttemptId: attempt.id, sessionId: session.id })]);
      await client.query('COMMIT');
      return { result: 'refund_required', bookingReference: booking.rows[0].reference };
    }
    const action = attempt.stage === 'balance' ? 'verify_card_balance_payment' : 'verify_card_payment';
    const transition = assertBookingTransitionAllowed({ status: booking.rows[0].status, action, actor: 'system' });
    await client.query(`INSERT INTO booking_payments
      (provisional_booking_id, booking_offer_id, stage, amount_pence, currency, method, status, verified_at, provider_reference, metadata)
      VALUES ($1, $2, $3, $4, $5, 'stripe', 'verified', NOW(), $6, $7::jsonb)`,
      [booking.rows[0].id, attempt.booking_offer_id, attempt.stage, attempt.amount_pence, attempt.currency,
        session.payment_intent || session.id, JSON.stringify({ checkoutSessionId: session.id })]);
    if (attempt.stage !== 'balance') await client.query(`UPDATE provisional_bookings SET status = $2, payment_method = 'stripe', payment_received_at = NOW(), confirmed_at = NOW()
      WHERE id = $1`, [booking.rows[0].id, transition.nextStatus]);
    await client.query(`UPDATE booking_checkout_attempts SET status = 'completed', stripe_payment_intent_id = $2, updated_at = NOW() WHERE id = $1`, [attempt.id, session.payment_intent || null]);
    await client.query(`INSERT INTO booking_activity (provisional_booking_id, booking_offer_id, actor, event_type, details)
      VALUES ($1, $2, 'system', $3, $4::jsonb)`, [booking.rows[0].id, attempt.booking_offer_id, transition.rule.activityEvent,
        JSON.stringify({ checkoutAttemptId: attempt.id, sessionId: session.id, paymentMethod: 'stripe', paymentStage: attempt.stage, amountPence: attempt.amount_pence })]);
    await insertBotBookingMessage(client, { bookingId: booking.rows[0].id, offerId: attempt.booking_offer_id,
      body: attempt.stage === 'balance' ? 'The remaining balance was received by card. The booking is confirmed and fully paid.' : 'The card payment was received. The direct booking is now confirmed.',
      audience: 'both', sourceKey: `card-payment:${attempt.id}` });
    await client.query('COMMIT');
    return { result: 'recorded', bookingReference: booking.rows[0].reference, stage: attempt.stage, amountPence: attempt.amount_pence, currency: attempt.currency };
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
  finally { client.release(); }
}

export async function refundUnexpectedCheckout(session: Record<string, any>): Promise<void> {
  if (typeof session.payment_intent !== 'string') return;
  const result = await stripePost('refunds', new URLSearchParams({ payment_intent: session.payment_intent }), `refund-checkout:${session.id}`);
  if (result.status === 'succeeded') {
    await getPool().query(`UPDATE booking_checkout_attempts SET status = 'refunded', updated_at = NOW() WHERE stripe_session_id = $1 AND status = 'refund_required'`, [session.id]);
  }
}

export async function closeUnpaidCheckout(session: Record<string, any>, status: 'expired' | 'failed'): Promise<void> {
  if (typeof session.id !== 'string') return;
  await getPool().query(`UPDATE booking_checkout_attempts SET status = $2, updated_at = NOW()
    WHERE stripe_session_id = $1 AND status = 'open'`, [session.id, status]);
}
