import http from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { createLocalFixtureDatabase } from './local-fixture-database.mjs';

const fixture = await createLocalFixtureDatabase('request_journey_preview');
const db = fixture.database;
for (const key of Object.keys(process.env)) {
  if (/^(BOOKING_|BOOKER_|STRIPE_|SMTP_|EMAIL_|RESEND_|TWILIO_|WHATSAPP_|AIRBNB_)/.test(key)) delete process.env[key];
}
Object.assign(process.env, {
  ASTRO_NODE_AUTOSTART: 'disabled', BOOKING_PUBLIC_URL: 'http://127.0.0.1:8085',
  BOOKER_VERIFICATION_SECRET: randomBytes(32).toString('hex'),
  BOOKER_AUTO_VERIFIED_EMAIL: 'changed@example.test',
  WHATSAPP_DELIVERY_ENABLED: 'false', STRIPE_SECRET_KEY: 'sk_test_disposable_preview',
  STRIPE_WEBHOOK_SECRET: 'whsec_disposable_preview', BOOKING_BANK_PAYEE: 'Disposable preview account',
  BOOKING_BANK_SORT_CODE: '00-00-00', BOOKING_BANK_ACCOUNT_NUMBER: '00000000',
});
globalThis.fetch = async () => { throw new Error('External requests are disabled in the request preview.'); };
try {
  await db.query("UPDATE pricing_plans SET status='archived' WHERE status='published'");
  await db.query("UPDATE occupancy_policies SET status='archived' WHERE status='published'");
  for (const property of ['cottage', 'main-house']) {
    const plan = (await db.query("INSERT INTO pricing_plans(property_id,name,status,version,published_at) VALUES($1,'Disposable journey price','published',100,NOW()) RETURNING id", [property])).rows[0].id;
    for (const [type, action] of [['default_nightly_price', { amountPence: 30000 }], ['deposit_percentage', { percentage: 25 }], ['initial_payment_deadline', { days: 7 }], ['balance_payment_deadline', { days: 42 }]]) {
      await db.query('INSERT INTO pricing_rules(plan_id,type,name,action,position) VALUES($1,$2,$2,$3::jsonb,(SELECT COALESCE(MAX(position),0)+10 FROM pricing_rules WHERE plan_id=$1))', [plan, type, JSON.stringify(action)]);
    }
    const policy = (await db.query("INSERT INTO occupancy_policies(property_id,name,status,version,published_at) VALUES($1,'Disposable journey occupancy','published',100,NOW()) RETURNING id", [property])).rows[0].id;
    for (const subject of ['guests', 'adults', 'children', 'infants', 'pets', 'service_animals']) await db.query("INSERT INTO occupancy_rules(policy_id,subject,maximum_standard_count,exceed_outcome) VALUES($1,$2,8,'host_decision_required')", [policy, subject]);
  }
  const account = (await db.query('INSERT INTO booker_accounts DEFAULT VALUES RETURNING id')).rows[0].id;
  await db.query("INSERT INTO booker_identities(channel,identifier,account_id) VALUES('email','journey@example.test',$1)", [account]);
  const token = randomBytes(32).toString('base64url');
  await db.query("INSERT INTO booker_sessions(token_hash,account_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '24 hours')", [createHash('sha256').update(token).digest('hex'), account]);
  let sequence = 0;
  const { handler } = await import('../../site/dist/server/entry.mjs');
  const server = http.createServer((request, response) => {
    if (request.url?.startsWith('/__request-preview/')) {
      const url = new URL(request.url, 'http://127.0.0.1:8085');
      const date = new Date('2099-01-10T12:00:00Z');
      date.setUTCDate(date.getUTCDate() + sequence++ * 10);
      const arrival = date.toISOString().slice(0, 10);
      date.setUTCDate(date.getUTCDate() + 4);
      const params = new URLSearchParams({ propertyId: url.searchParams.get('bespoke') === '1' ? 'bespoke-arrangement' : 'cottage', arrival, departure: date.toISOString().slice(0, 10), adults: '2', children: '0', infants: '0', pets: '0', bookingContinue: 'checked' });
      response.writeHead(303, { 'Cache-Control': 'no-store',
        'Set-Cookie': `olrig_booker_session=${token}; HttpOnly; SameSite=Lax; Path=/`,
        Location: `/book/?${params}` });
      response.end();
      return;
    }
    handler(request, response);
  });
  server.listen(8085, '127.0.0.1', () => console.log('Request journey preview: http://127.0.0.1:8085/__request-preview/ — use journey@example.test'));
  const cleanup = async () => { server.close(); await fixture.close(); process.exit(0); };
  process.once('SIGINT', cleanup); process.once('SIGTERM', cleanup);
} catch (error) { await fixture.close(); throw error; }
