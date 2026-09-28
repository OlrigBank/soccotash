import http from 'node:http';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { createLocalFixtureDatabase } from './local-fixture-database.mjs';
import { importAirbnbReviews } from '../../site/src/lib/airbnb-import/reviews.ts';

export async function startAirbnbReviewPreview(port = 8087) {
  const fixture = await createLocalFixtureDatabase('airbnb_date_preview');
  for (const key of Object.keys(process.env)) {
    if (/^(BOOKING_|BOOKER_|STRIPE_|SMTP_|EMAIL_|RESEND_|TWILIO_|WHATSAPP_)/u.test(key)) delete process.env[key];
  }
  Object.assign(process.env, { DATABASE_SSL: 'false', ASTRO_NODE_AUTOSTART: 'disabled', WHATSAPP_DELIVERY_ENABLED: 'false' });
  let server;
  try {
    const admin = (await fixture.database.query("INSERT INTO admin_users(email,display_name,password_hash) VALUES('airbnb-preview@example.test','Disposable administrator','no-password-login') RETURNING id")).rows[0];
    const token = crypto.randomBytes(32).toString('hex');
    await fixture.database.query("INSERT INTO admin_sessions(admin_user_id,token_hash,expires_at) VALUES($1,$2,NOW()+INTERVAL '1 hour')", [admin.id, crypto.createHash('sha256').update(token).digest('hex')]);
    for (const [index, publishedAt] of ['2026-08-30', null].entries()) {
      const review = {
        source: { platform: 'airbnb', reviewId: `90000000000000000${index}`, pdfFilename: `fixture-${index}.pdf`, capturedAt: '2026-09-28' },
        reviewer: { displayName: publishedAt ? 'Dated fixture guest' : 'Undated fixture guest' },
        listing: { key: 'main-house', displayName: 'Olrig Bank', sourceDisplayName: 'Olrig Bank' },
        stay: { checkIn: '2026-08-27', checkOut: '2026-08-30', nights: 3, yearSource: publishedAt ? 'displayed' : 'current-year-assumption' },
        publishedAt, publicReview: { rating: 5, text: 'Disposable review content for local verification.' }, privateFeedback: null,
        detailedRatings: ['Check-in', 'Cleanliness', 'Accuracy', 'Communication', 'Location', 'Value'].map(category => ({ category, rating: 5, feedback: [] })),
      };
      await importAirbnbReviews({ sourceSnapshotOn: '2026-09-28', documents: [{
        relativePath: `output/pdf/fixture-${index}.pdf`, sha256: crypto.createHash('sha256').update(`fixture-${index}`).digest('hex'), pageCount: 1, capturedAt: '2026-09-28T00:00:00Z', review,
      }] }, fixture.database);
    }
    const { handler } = await import('../../site/dist/server/entry.mjs');
    server = http.createServer((request, response) => {
      if (request.url === '/__airbnb-preview/') {
        response.writeHead(303, { 'Set-Cookie': `olrig_admin_session=${token}; HttpOnly; SameSite=Lax; Path=/`, 'Cache-Control': 'no-store', Location: '/admin/airbnb/reviews/' });
        response.end();
      } else handler(request, response);
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
    return { close: async () => { await new Promise(resolve => server.close(resolve)); await fixture.close(); } };
  } catch (error) { if (server) server.close(); await fixture.close(); throw error; }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const preview = await startAirbnbReviewPreview();
  console.log('Disposable Airbnb review preview: http://127.0.0.1:8087/__airbnb-preview/');
  const stop = async () => { await preview.close(); process.exit(0); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}
