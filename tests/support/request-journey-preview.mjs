import http from 'node:http';
import { fixtureCardProvider } from './fixture-card-provider.mjs';
const simulatedCard = process.env.REQUEST_PREVIEW_SIMULATE_CARD === 'yes';
const publicJourney = process.env.REQUEST_PREVIEW_PUBLIC_JOURNEY === 'yes';
const mailbox = new Map();
const port = publicJourney ? 8087 : simulatedCard ? 8086 : 8085;
const origin = `http://127.0.0.1:${port}`;
const provider = simulatedCard ? fixtureCardProvider(origin) : null;
import { randomBytes, createHash } from 'node:crypto';
import { createLocalFixtureDatabase } from './local-fixture-database.mjs';

const fixture = await createLocalFixtureDatabase('request_journey_preview');
const db = fixture.database;
for (const key of Object.keys(process.env)) {
  if (/^(BOOKING_|BOOKER_|STRIPE_|SMTP_|EMAIL_|RESEND_|TWILIO_|WHATSAPP_|AIRBNB_)/.test(key)) delete process.env[key];
}
Object.assign(process.env, {
  ASTRO_NODE_AUTOSTART: 'disabled', BOOKING_PUBLIC_URL: origin,
  BOOKER_VERIFICATION_SECRET: randomBytes(32).toString('hex'),
  BOOKER_AUTO_VERIFIED_EMAIL: 'changed@example.test',
  WHATSAPP_DELIVERY_ENABLED: 'false', STRIPE_SECRET_KEY: 'sk_test_disposable_preview',
  STRIPE_WEBHOOK_SECRET: 'whsec_disposable_preview', BOOKING_BANK_PAYEE: 'Disposable preview account',
  BOOKING_BANK_SORT_CODE: '00-00-00', BOOKING_BANK_ACCOUNT_NUMBER: '00000000',
});
if (publicJourney) Object.assign(process.env, { EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'disposable-local-mailbox', BOOKING_EMAIL_FROM: 'preview@example.test' });
globalThis.fetch = async (url, options) => {
  if (publicJourney && String(url) === 'https://api.resend.com/emails') {
    const message = JSON.parse(String(options.body));
    for (const recipient of [message.to].flat()) {
      if (!String(recipient).endsWith('@example.test')) throw new Error('Only disposable fixture email addresses are allowed.');
      const messages = mailbox.get(recipient) || [];
      messages.push(message); mailbox.set(recipient, messages);
    }
    return Response.json({ id: randomBytes(12).toString('hex') });
  }
  if (provider) return provider.fetch(url, options);
  throw new Error('External requests are disabled in the request preview.');
};
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
  const admin = (await db.query("INSERT INTO admin_users(email,display_name,password_hash) VALUES('admin@example.test','Preview administrator','no-password-login') RETURNING id")).rows[0].id;
  const adminToken = randomBytes(32).toString('base64url');
  await db.query("INSERT INTO admin_sessions(admin_user_id,token_hash,expires_at) VALUES($1,$2,NOW()+INTERVAL '24 hours')", [admin, createHash('sha256').update(adminToken).digest('hex')]);
  let sequence = 0;
  const { handler } = await import('../../site/dist/server/entry.mjs');
  const server = http.createServer(async (request, response) => {
    if (provider?.handle(request, response)) return;
    if (request.url === '/__admin-preview/') {
      response.writeHead(303, { 'Cache-Control': 'no-store',
        'Set-Cookie': `olrig_admin_session=${adminToken}; HttpOnly; SameSite=Lax; Path=/`,
        Location: '/admin/bookings/' });
      response.end(); return;
    }
    if (publicJourney && request.method === 'POST' && request.url === '/__mailbox/advance-cooldown') {
      // Simulate returning after the resend cooldown without weakening production checks.
      await db.query("UPDATE booker_verification_requests SET created_at=created_at-INTERVAL '61 seconds'");
      response.writeHead(204); response.end(); return;
    }
    if (publicJourney && request.url?.startsWith('/__mailbox/')) {
      const email = new URL(request.url, origin).searchParams.get('email');
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify(mailbox.get(email) || [])); return;
    }
    if (request.url?.startsWith('/__request-preview/')) {
      const url = new URL(request.url, origin);
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
  server.listen(port, '127.0.0.1', () => console.log(`Request journey preview: ${origin}/__request-preview/ — use journey@example.test`));
  const cleanup = async () => { server.close(); await fixture.close(); process.exit(0); };
  process.once('SIGINT', cleanup); process.once('SIGTERM', cleanup);
} catch (error) { await fixture.close(); throw error; }
