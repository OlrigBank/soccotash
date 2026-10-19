import http from 'node:http';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { createLocalFixtureDatabase } from './local-fixture-database.mjs';
import { seedHistoryFixtures } from '../../site/tests/pricing/history-fixtures.ts';

export async function startPricingHistoryPreview(port = 8096) {
  const fixture = await createLocalFixtureDatabase('pricing_history_preview');
  for (const key of Object.keys(process.env)) if (/^(BOOKING_|BOOKER_|STRIPE_|SMTP_|EMAIL_|RESEND_|TWILIO_|WHATSAPP_)/u.test(key)) delete process.env[key];
  Object.assign(process.env, { DATABASE_SSL: 'false', ASTRO_NODE_AUTOSTART: 'disabled', WHATSAPP_DELIVERY_ENABLED: 'false' });
  let server;
  try {
    await seedHistoryFixtures(fixture.database);
    const admin = (await fixture.database.query("INSERT INTO admin_users(email,display_name,password_hash) VALUES('pricing-preview@example.test','Disposable pricing administrator','no-password-login') RETURNING id")).rows[0];
    const token = crypto.randomBytes(32).toString('hex');
    await fixture.database.query("INSERT INTO admin_sessions(admin_user_id,token_hash,expires_at) VALUES($1,$2,NOW()+INTERVAL '2 hours')", [admin.id, crypto.createHash('sha256').update(token).digest('hex')]);
    const { handler } = await import('../../site/dist/server/entry.mjs');
    server = http.createServer((request, response) => {
      if (request.url === '/__pricing-history-preview/') {
        response.writeHead(303, { 'Set-Cookie': `olrig_admin_session=${token}; HttpOnly; SameSite=Lax; Path=/`, 'Cache-Control': 'no-store', Location: '/admin/pricing/history/' }); response.end();
      } else handler(request, response);
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
    return { origin: `http://127.0.0.1:${server.address().port}`, close: async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await fixture.close(); } };
  } catch (error) { server?.close(); await fixture.close(); throw error; }
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const preview = await startPricingHistoryPreview(Number(process.env.PRICING_HISTORY_PORT || 8096));
  console.log(`Disposable pricing history preview: ${preview.origin}/__pricing-history-preview/`);
  const stop = async () => { await preview.close(); process.exit(0); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
}
