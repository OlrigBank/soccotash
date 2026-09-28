import http from 'node:http';
import { createLocalFixtureDatabase } from './local-fixture-database.mjs';
import { createReservationFixture } from './reservation-fixture.mjs';

// Local-only presentation fixtures: no real contact details or payment providers.
const fixtureDatabase = await createLocalFixtureDatabase('payment_preview');
for (const key of Object.keys(process.env)) {
  if (/^(BOOKING_|BOOKER_|STRIPE_|SMTP_|EMAIL_|RESEND_|TWILIO_|WHATSAPP_)/.test(key)) delete process.env[key];
}
Object.assign(process.env, {
  DATABASE_SSL: 'false', ASTRO_NODE_AUTOSTART: 'disabled',
  BOOKING_PUBLIC_URL: 'http://127.0.0.1:8083', WHATSAPP_DELIVERY_ENABLED: 'false',
  STRIPE_SECRET_KEY: 'sk_test_disposable_preview',
  STRIPE_WEBHOOK_SECRET: 'whsec_disposable_preview',
  BOOKING_BANK_PAYEE: 'Disposable preview account', BOOKING_BANK_SORT_CODE: '00-00-00',
  BOOKING_BANK_ACCOUNT_NUMBER: '00000000',
});
globalThis.fetch = async () => { throw new Error('External requests are disabled in the payment preview.'); };

const fixtures = new Map();
try {
  for (const state of ['payment_pending', 'pending', 'offered', 'confirmed', 'cancelled', 'payment_reported', 'balance']) {
    const fixture = await createReservationFixture();
    fixtures.set(state, fixture);
    await fixture.setStatus(state === 'balance' ? 'confirmed' : state);
    await fixture.database.query(`UPDATE provisional_bookings SET guest_name='Alex Example',
      guest_email='alex@example.test',guest_telephone='+44 7700 900123',property_id='cottage',
      deposit_due_at=NOW()+INTERVAL '7 days' WHERE id=$1`, [fixture.booking.id]);
    await fixture.database.query("UPDATE booking_offers SET terms='Please review the cancellation terms before paying.' WHERE provisional_booking_id=$1", [fixture.booking.id]);
    if (['confirmed', 'balance', 'payment_reported'].includes(state)) {
      await fixture.database.query(`INSERT INTO booking_payments
        (provisional_booking_id,stage,amount_pence,method,status,verified_at)
        VALUES($1,$2,$3,'bank_transfer',$4,$5)`, [fixture.booking.id,
        state === 'confirmed' ? 'full_payment' : 'deposit', state === 'confirmed' ? 100000 : 20000,
        state === 'payment_reported' ? 'reported' : 'verified', state === 'payment_reported' ? null : new Date()]);
    }
    if (state === 'confirmed') await fixture.database.query('UPDATE provisional_bookings SET deposit_pence=100000,balance_due_pence=0,balance_due_on=NULL WHERE id=$1', [fixture.booking.id]);
  }
  const { handler } = await import('../../site/dist/server/entry.mjs');
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1:8083');
    if (url.pathname === '/__payment-preview/') {
      const fixture = fixtures.get(url.searchParams.get('state') || 'payment_pending');
      if (!fixture) { response.writeHead(404); response.end('Unknown preview state'); return; }
      response.writeHead(303, {
        'Set-Cookie': `olrig_booker_session=${fixture.token}; HttpOnly; SameSite=Lax; Path=/`,
        'Cache-Control': 'no-store',
        Location: `/booking/manage/${fixture.booking.reference}/payment/?method=${url.searchParams.get('method') === 'bank' ? 'bank' : 'card'}`,
      });
      response.end();
      return;
    }
    handler(request, response);
  });
  server.listen(8083, '127.0.0.1', () => console.log('Payment preview: http://127.0.0.1:8083/__payment-preview/'));
  const cleanup = async () => {
    server.close();
    for (const fixture of fixtures.values()) {
      // The display name differs from the fixture helper's unique cleanup name.
      await fixture.database.query('DELETE FROM provisional_bookings WHERE id=$1', [fixture.booking.id]);
      await fixture.cleanup();
    }
    await fixtureDatabase.close();
    process.exit(0);
  };
  process.once('SIGINT', cleanup);
  process.once('SIGTERM', cleanup);
} catch (error) {
  for (const fixture of fixtures.values()) {
    await fixture.database.query('DELETE FROM provisional_bookings WHERE id=$1', [fixture.booking.id]);
    await fixture.cleanup();
  }
  await fixtureDatabase.close();
  throw error;
}
