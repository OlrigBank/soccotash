import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createLocalFixtureDatabase } from './local-fixture-database.mjs';
import { importAirbnbReviews } from '../../site/src/lib/airbnb-import/reviews.ts';

// A disposable database gives CI published reviews without private Airbnb evidence.
const fixture = await createLocalFixtureDatabase('public_review_preview');
let server;
try {
  const approved = JSON.parse(await readFile(new URL('../../site/src/data/public-reviews.json', import.meta.url), 'utf8')).reviews;
  const categories = ['Check-in', 'Cleanliness', 'Accuracy', 'Communication', 'Location', 'Value'];
  const documents = approved.map((publicReview, index) => {
    const capturedAt = '2026-09-01T00:00:00Z';
    const checkIn = new Date(Date.UTC(2026, 0, approved.length - index));
    const checkOut = new Date(checkIn.valueOf() + publicReview.stay.nights * 86400000);
    return { relativePath: `output/pdf/public-fixture-${index}.pdf`, sha256: createHash('sha256').update(`public-fixture-${index}`).digest('hex'), pageCount: 1, capturedAt,
      review: { source: { platform: 'airbnb', reviewId: String(9000000000 + index), pdfFilename: `public-fixture-${index}.pdf`, capturedAt: '2026-09-01' },
        reviewer: publicReview.reviewer, listing: { ...publicReview.listing, sourceDisplayName: publicReview.listing.displayName },
        stay: { checkIn: checkIn.toISOString().slice(0,10), checkOut: checkOut.toISOString().slice(0,10), nights: publicReview.stay.nights },
        publishedAt: null, publicReview: { rating: publicReview.rating, text: publicReview.quote }, privateFeedback: null,
        detailedRatings: categories.map(category => ({ category, rating: 5, feedback: [] })) } };
  });
  await importAirbnbReviews({ sourceSnapshotOn: '2026-09-01', documents }, fixture.database);
  for (const [index, review] of approved.entries()) {
    await fixture.database.query(`INSERT INTO airbnb_review_publications(review_id,published,public_review,category_scores)
      SELECT id,TRUE,$2::jsonb,$3::jsonb FROM airbnb_reviews WHERE review_id=$1`,
      [String(9000000000 + index), JSON.stringify(review), JSON.stringify(categories.map(displayName => ({ key: displayName.toLowerCase(), displayName, score: 5 })))]);
  }
  for (const key of Object.keys(process.env)) if (/^(BOOKING_|BOOKER_|STRIPE_|SMTP_|EMAIL_|RESEND_|TWILIO_|WHATSAPP_)/u.test(key)) delete process.env[key];
  process.env.ASTRO_NODE_AUTOSTART = 'disabled';
  const { handler } = await import('../../site/dist/server/entry.mjs');
  server = http.createServer(handler);
  server.listen(Number(process.env.PORT || 8080), '127.0.0.1');
  const stop = async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await fixture.close(); process.exit(0); };
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
} catch (error) { server?.close(); await fixture.close(); throw error; }
