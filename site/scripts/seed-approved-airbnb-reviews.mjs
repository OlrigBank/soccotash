#!/usr/bin/env node
// Explicit one-time migration of the already approved public set. Never run on startup.
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';
import { parseReviewPdfText, toPublicReview } from './generate-airbnb-review-datasets.mjs';
import { importAirbnbReviews } from '../src/lib/airbnb-import/reviews.ts';
import { validatePublicReviewData, validatePublicReviewSummary } from '../src/lib/public-reviews.ts';
import { publicReviewSummary } from '../src/lib/airbnb-admin/publication.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const approved = validatePublicReviewData(JSON.parse(await readFile(path.join(root, 'site/src/data/public-reviews.json'), 'utf8'))).reviews;
const expectedSummary = validatePublicReviewSummary(JSON.parse(await readFile(path.join(root, 'site/src/data/public-review-summary.json'), 'utf8')));
const manifest = JSON.parse(await readFile(path.join(root, 'docs/source-material/airbnb/reviews/private-review-manifest.json'), 'utf8'));
// Resolve every approval and reparse its evidence before making any database changes.
const entries = [];
for (const review of approved) {
  const sources = manifest.reviews.filter(source => toPublicReview(source, review.publication.approvedAt).id === review.id);
  if (sources.length !== 1) throw new Error('Approved review has no unique historical source.');
  const source = sources[0];
  const filename = source.source.pdfFilename;
  if (path.basename(filename) !== filename) throw new Error('Invalid historical PDF filename.');
  const relativePath = `output/pdf/airbnb-reviews/${filename}`;
  const pdf = path.join(root, relativePath);
  const parsed = parseReviewPdfText(execFileSync('pdftotext', ['-layout', pdf, '-'], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }), filename);
  if (parsed.source.reviewId !== source.source.reviewId || !isDeepStrictEqual(toPublicReview(parsed, review.publication.approvedAt), review)) throw new Error('Historical PDF does not match the approved public review.');
  const categories = ['Check-in', 'Cleanliness', 'Accuracy', 'Communication', 'Location', 'Value'];
  const scores = categories.map(displayName => ({ key: displayName.toLowerCase(), displayName, score: parsed.detailedRatings.find(rating => rating.category === displayName)?.rating }));
  publicReviewSummary([review], [scores]);
  const pageCount = Number(execFileSync('pdfinfo', [pdf], { encoding: 'utf8' }).match(/^Pages:\s+(\d+)$/mu)?.[1]);
  if (!pageCount) throw new Error('Historical PDF has no page count.');
  entries.push({ review, scores, document: { relativePath, sha256: createHash('sha256').update(await readFile(pdf)).digest('hex'), pageCount,
    capturedAt: `${parsed.source.capturedAt}T00:00:00Z`, review: parsed } });
}
const summary = publicReviewSummary(approved, entries.map(entry => entry.scores));
if (!summary || summary.reviewCount !== expectedSummary.reviewCount || summary.overallScore !== expectedSummary.overallScore || !isDeepStrictEqual(summary.categories, expectedSummary.categories)) throw new Error('Historical category ratings differ from the approved summary.');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const database = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined, max: 2 });
try {
  const existing = new Set((await database.query('SELECT review_id FROM airbnb_reviews')).rows.map(row => row.review_id));
  const missing = entries.filter(entry => !existing.has(entry.document.review.source.reviewId));
  if (missing.length) await importAirbnbReviews({ sourceSnapshotOn: entries.map(entry => entry.document.review.source.capturedAt).sort().at(-1), documents: missing.map(entry => entry.document) }, database);
  const client = await database.connect();
  let added = 0;
  try {
    await client.query('BEGIN');
    for (const entry of entries) {
      const result = await client.query(`INSERT INTO airbnb_review_publications(review_id,published,public_review,category_scores)
        SELECT id,TRUE,$2::jsonb,$3::jsonb FROM airbnb_reviews WHERE review_id=$1
        ON CONFLICT(review_id) DO NOTHING RETURNING review_id`,
        [entry.document.review.source.reviewId, JSON.stringify(entry.review), JSON.stringify(entry.scores)]);
      added += result.rowCount;
    }
    if (added) await client.query(`INSERT INTO admin_audit_log(action,entity_type,details) VALUES('airbnb_review.seed_approved','airbnb_review',$1::jsonb)`, [JSON.stringify({ added, source: 'existing approved public dataset' })]);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
  console.log(`Verified ${entries.length} historical approvals; imported ${missing.length} missing reviews; added ${added} publication records. Existing publication decisions were preserved.`);
} catch (error) {
  console.error('Approved review migration stopped:', error.code || error.name);
  process.exitCode = 1;
} finally { await database.end(); }
