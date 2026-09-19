import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';

const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

test('a paid Stripe event confirms once, rejects stale payment and verifies signatures', async () => {
  assert.ok(databaseUrl, 'A local PostgreSQL URL is required.');
  assert.ok(['localhost', '127.0.0.1'].includes(new URL(databaseUrl).hostname), 'Use a local database.');
  const schema = `card_checkout_${process.pid}_${randomUUID().replaceAll('-', '')}`;
  const control = new pg.Pool({ connectionString: databaseUrl });
  const originalUrl = process.env.DATABASE_URL;
  const originalSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const originalKey = process.env.STRIPE_SECRET_KEY;
  const originalFetch = globalThis.fetch;
  let application: pg.Pool | undefined;
  try {
    await control.query(`CREATE SCHEMA "${schema}"`);
    const url = new URL(databaseUrl);
    url.searchParams.set('options', `-c search_path=${schema},public`);
    process.env.DATABASE_URL = url.toString();
    const migration = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const directory = new URL('../../db/', import.meta.url);
      for (const name of (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort()) {
        await migration.query(await readFile(new URL(name, directory), 'utf8'));
      }
    } finally { await migration.end(); }
    const { getPool } = await import('../../src/lib/booking/db.ts');
    const { recordPaidCheckout, startCardCheckout, verifyStripeEvent } = await import('../../src/lib/booking/stripe-checkout.ts');
    const { reportManualBankTransfer } = await import('../../src/lib/booking/payment-lifecycle.ts');
    const { bookerContext } = await import('../../src/lib/booker/context.ts');
    application = getPool();
    const booking = (await application.query(`INSERT INTO provisional_bookings
      (property_id, arrival, departure, guests, guest_name, guest_email, status, deposit_pence, balance_due_pence, pricing_currency)
      VALUES ('cottage', CURRENT_DATE + 100, CURRENT_DATE + 104, 2, 'Disposable card test', '', 'payment_pending', 20000, 60000, 'GBP')
      RETURNING id, public_id::text AS reference`)).rows[0];
    const offer = (await application.query(`INSERT INTO booking_offers
      (provisional_booking_id, line_items, total_pence, recipient_email, subject, customer_status, published_at, valid_until)
      VALUES ($1, '[{"label":"Stay","amountPence":80000}]', 80000, '', 'Disposable offer', 'accepted', NOW(), CURRENT_DATE + 7)
      RETURNING id`, [booking.id])).rows[0];
    const account = (await application.query('INSERT INTO booker_accounts DEFAULT VALUES RETURNING id')).rows[0];
    await application.query('UPDATE provisional_bookings SET booker_account_id=$2 WHERE id=$1', [booking.id, account.id]);
    process.env.STRIPE_SECRET_KEY = 'sk_test_disposable';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_disposable_test';
    let checkoutCalls = 0;
    globalThis.fetch = async (_url, options) => {
      checkoutCalls += 1;
      const body = options?.body as URLSearchParams;
      assert.equal(body.get('line_items[0][price_data][unit_amount]'), '20000');
      assert.equal(body.get('payment_method_types[0]'), 'card');
      return Response.json({ id: 'cs_test_disposable_1', url: 'https://checkout.stripe.com/test/disposable' });
    };
    const checkout = () => bookerContext.run({ accountId: account.id }, () => startCardCheckout(booking.reference, 'http://localhost:8080'));
    assert.equal((await checkout()).url, 'https://checkout.stripe.com/test/disposable');
    assert.equal((await checkout()).url, 'https://checkout.stripe.com/test/disposable');
    assert.equal(checkoutCalls, 1);
    assert.equal(await bookerContext.run({ accountId: account.id }, () => reportManualBankTransfer(booking.reference)), 'payment_not_due');
    const attempt = (await application.query(`SELECT id FROM booking_checkout_attempts WHERE provisional_booking_id=$1`, [booking.id])).rows[0];
    const session = { object: 'checkout.session', id: 'cs_test_disposable_1', payment_status: 'paid', amount_total: 20000,
      currency: 'gbp', client_reference_id: booking.reference, payment_intent: 'pi_test_disposable_1' };
    const payload = JSON.stringify({ type: 'checkout.session.completed', data: { object: session } });
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET).update(`${timestamp}.${payload}`).digest('hex');
    assert.equal(verifyStripeEvent(payload, `t=${timestamp},v1=${signature}`).data.object.id, session.id);
    assert.throws(() => verifyStripeEvent(payload, `t=${timestamp},v1=${'0'.repeat(64)}`), /INVALID_STRIPE_SIGNATURE/);
    assert.equal((await recordPaidCheckout(session)).result, 'recorded');
    assert.equal((await recordPaidCheckout(session)).result, 'duplicate');
    assert.equal((await application.query('SELECT status FROM provisional_bookings WHERE id=$1', [booking.id])).rows[0].status, 'confirmed');
    assert.deepEqual((await application.query('SELECT stage, method, status FROM booking_payments WHERE provisional_booking_id=$1', [booking.id])).rows,
      [{ stage: 'deposit', method: 'stripe', status: 'verified' }]);
    assert.equal((await application.query('SELECT status FROM booking_checkout_attempts WHERE id=$1', [attempt.id])).rows[0].status, 'completed');

    await application.query(`INSERT INTO booking_checkout_attempts
      (provisional_booking_id, booking_offer_id, stage, amount_pence, currency, status, stripe_session_id)
      VALUES ($1, $2, 'balance', 60000, 'GBP', 'open', 'cs_test_disposable_2')`, [booking.id, offer.id]);
    const balance = { ...session, id: 'cs_test_disposable_2', amount_total: 60000, payment_intent: 'pi_test_disposable_2' };
    assert.equal((await recordPaidCheckout(balance)).result, 'recorded');
    assert.equal((await recordPaidCheckout(balance)).result, 'duplicate');
    assert.equal((await application.query('SELECT status FROM provisional_bookings WHERE id=$1', [booking.id])).rows[0].status, 'confirmed');
    assert.equal((await application.query('SELECT count(*)::int AS count FROM booking_payments WHERE provisional_booking_id=$1', [booking.id])).rows[0].count, 2);
    await application.query(`INSERT INTO booking_checkout_attempts
      (provisional_booking_id, booking_offer_id, stage, amount_pence, currency, status, stripe_session_id)
      VALUES ($1, $2, 'balance', 60000, 'GBP', 'open', 'cs_test_disposable_3')`, [booking.id, offer.id]);
    await application.query(`UPDATE provisional_bookings SET status='cancelled' WHERE id=$1`, [booking.id]);
    const late = { ...session, id: 'cs_test_disposable_3', amount_total: 60000, payment_intent: 'pi_test_disposable_3' };
    assert.equal((await recordPaidCheckout(late)).result, 'refund_required');
    assert.equal((await application.query("SELECT status FROM booking_checkout_attempts WHERE stripe_session_id='cs_test_disposable_3'")).rows[0].status, 'refund_required');
    assert.equal((await application.query('SELECT count(*)::int AS count FROM booking_payments WHERE provisional_booking_id=$1', [booking.id])).rows[0].count, 2);
  } finally {
    if (application) await application.end();
    process.env.DATABASE_URL = originalUrl;
    process.env.STRIPE_WEBHOOK_SECRET = originalSecret;
    process.env.STRIPE_SECRET_KEY = originalKey;
    globalThis.fetch = originalFetch;
    await control.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await control.end();
  }
});
