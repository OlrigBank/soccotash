#!/usr/bin/env node
import http from 'node:http';

// Local review-only preview of the built application. Supply a local DATABASE_URL.
if (!process.env.DATABASE_URL || !['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname)) throw new Error('A local database is required.');
for (const key of Object.keys(process.env)) {
  if (/^(BOOKING_|BOOKER_|STRIPE_|SMTP_|EMAIL_|RESEND_|TWILIO_|WHATSAPP_)/u.test(key)) delete process.env[key];
}
Object.assign(process.env, { DATABASE_SSL: 'false', ASTRO_NODE_AUTOSTART: 'disabled', WHATSAPP_DELIVERY_ENABLED: 'false' });
const { handler } = await import('../dist/server/entry.mjs');
const allowedActions = new Set(['/api/admin/airbnb/reviews/publication/', '/admin/login/', '/admin/logout/']);
const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  if (!['GET', 'HEAD'].includes(request.method) && !allowedActions.has(pathname)) {
    response.writeHead(503, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
    response.end('This local preview supports review publication only.');
    return;
  }
  handler(request, response);
});
server.listen(Number(process.env.PORT || 8081), '127.0.0.1', () => console.log(`Local review preview: http://localhost:${server.address().port}/`));
const stop = () => { server.close(() => process.exit(0)); server.closeAllConnections(); };
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
