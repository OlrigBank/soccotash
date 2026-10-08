import http from 'node:http';
import { createHash } from 'node:crypto';
import { createLocalFixtureDatabase } from './local-fixture-database.mjs';

// Disposable local account/session: never authenticates a real administrator.
const fixture = await createLocalFixtureDatabase('welcome_admin_preview');
let server;
try {
  const user = await fixture.database.query(`INSERT INTO admin_users (email, display_name, password_hash)
    VALUES ('welcome-preview@example.invalid', 'Welcome preview administrator', 'no-login-fixture') RETURNING id`);
  await fixture.database.query(`INSERT INTO admin_sessions (admin_user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL '1 hour')`,
    [user.rows[0].id, createHash('sha256').update('welcome-disposable-admin-session').digest('hex')]);
  for (const key of Object.keys(process.env)) if (/^(BOOKING_|BOOKER_|STRIPE_|SMTP_|EMAIL_|RESEND_|TWILIO_|WHATSAPP_)/u.test(key)) delete process.env[key];
  process.env.ASTRO_NODE_AUTOSTART = 'disabled';
  const { handler } = await import('../../site/dist/server/entry.mjs');
  server = http.createServer(handler);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(Number(process.env.PORT || 8099), '127.0.0.1', resolve); });
  console.log('Disposable welcome admin preview ready.');
  const stop = async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await fixture.close(); process.exit(0); };
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
} catch (error) { server?.close(); await fixture.close(); throw error; }
