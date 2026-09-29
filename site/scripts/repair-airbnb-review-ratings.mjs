#!/usr/bin/env node
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import pg from 'pg';
import { parseReviewDialog } from './airbnb-capture/records.mjs';

// Correct derived records only; captured JSON/PDFs and imported evidence stay immutable.
export async function repairReviewRatingTokens(captures, database, { apply = false } = {}) {
  const client = await database.connect();
  const result = { checked: 0, reviews: 0, publications: 0, feedbackTokens: 0 };
  try {
    await client.query('BEGIN');
    for (const capture of captures) {
      const before = capture.review;
      const after = parseReviewDialog({ text: capture.dialogText, reviewId: before.source.reviewId,
        capturedAt: capture.capturedAt, knownReview: before });
      // Existing date provenance is outside this repair's scope.
      if (Object.hasOwn(before.stay, 'yearSource')) after.stay.yearSource = before.stay.yearSource;
      else delete after.stay.yearSource;
      const expected = structuredClone(before);
      const prefix = `${before.publicReview.rating} `;
      if (before.publicReview.text !== after.publicReview.text) {
        if (before.publicReview.text !== prefix + after.publicReview.text) throw new Error('Unexpected public text difference.');
        expected.publicReview.text = after.publicReview.text;
      }
      for (const [index, category] of before.detailedRatings.entries()) {
        expected.detailedRatings[index].feedback = category.feedback.filter(value => value !== String(category.rating));
      }
      if (!isDeepStrictEqual(expected, after)) throw new Error('Repair would change more than duplicated rating tokens.');
      const found = await client.query(`SELECT r.id::text,r.public_id::text,r.public_text,r.overall_rating,
        s.raw_extraction,s.sha256 FROM airbnb_reviews r JOIN airbnb_source_documents s ON s.id=r.source_document_id
        WHERE r.review_id=$1 FOR UPDATE OF r`, [before.source.reviewId]);
      if (!found.rowCount) throw new Error('Capture has not been imported.');
      const row = found.rows[0];
      if (!isDeepStrictEqual(row.raw_extraction, before)) throw new Error('Saved capture does not match imported evidence.');
      if (![before.publicReview.text, after.publicReview.text].includes(row.public_text) || row.overall_rating !== after.publicReview.rating) throw new Error('Imported public content has changed; manual review required.');
      let changed = false;
      if (row.public_text !== after.publicReview.text) {
        await client.query('UPDATE airbnb_reviews SET public_text=$2,updated_at=NOW() WHERE id=$1', [row.id, after.publicReview.text]);
        result.reviews++; changed = true;
      }
      const ratings = await client.query('SELECT id::text,category_display_name,rating FROM airbnb_review_category_ratings WHERE review_id=$1', [row.id]);
      if (ratings.rowCount !== after.detailedRatings.length) throw new Error('Category rating count differs.');
      for (const category of after.detailedRatings) {
        const rating = ratings.rows.find(value => value.category_display_name === category.category);
        if (!rating || rating.rating !== category.rating) throw new Error('Category score differs.');
        const tags = await client.query('SELECT id::text,feedback_text FROM airbnb_review_feedback_tags WHERE category_rating_id=$1 ORDER BY position', [rating.id]);
        const previous = before.detailedRatings.find(value => value.category === category.category).feedback;
        const values = tags.rows.map(value => value.feedback_text);
        if (!isDeepStrictEqual(values, previous) && !isDeepStrictEqual(values, category.feedback)) throw new Error('Category feedback has changed.');
        for (const tag of tags.rows.filter(value => value.feedback_text === String(category.rating))) {
          await client.query('DELETE FROM airbnb_review_feedback_tags WHERE id=$1', [tag.id]);
          result.feedbackTokens++; changed = true;
        }
      }
      const publications = await client.query('SELECT public_review FROM airbnb_review_publications WHERE review_id=$1 FOR UPDATE', [row.id]);
      if (publications.rowCount) {
        const publicReview = publications.rows[0].public_review;
        // Preserve publication decisions and independently approved wording.
        if (publicReview.quote === before.publicReview.text && publicReview.quote !== after.publicReview.text) {
          if (publicReview.rating !== after.publicReview.rating) throw new Error('Approved rating differs.');
          publicReview.quote = after.publicReview.text;
          await client.query('UPDATE airbnb_review_publications SET public_review=$2::jsonb,revision=revision+1,updated_at=NOW() WHERE review_id=$1', [row.id, JSON.stringify(publicReview)]);
          result.publications++; changed = true;
        }
      }
      if (changed) await client.query(`INSERT INTO admin_audit_log(action,entity_type,entity_id,details)
        VALUES('airbnb_review.repair_rating_tokens','airbnb_review',$1,$2::jsonb)`, [row.public_id, JSON.stringify({
          sourcePdfSha256: row.sha256,
          dialogSha256: createHash('sha256').update(capture.dialogText).digest('hex'),
          repair: 'duplicate-accessible-visible-rating-v1',
        })]);
      result.checked++;
    }
    await client.query(apply ? 'COMMIT' : 'ROLLBACK');
    return result;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const directory = args.find(value => !value.startsWith('--'));
  if (!directory || args.some(value => value.startsWith('--') && value !== '--apply')) throw new Error('Usage: repair-airbnb-review-ratings.mjs <private capture directory> [--apply]');
  const captures = [];
  for (const name of (await readdir(directory)).filter(value => /^\d+\.json$/u.test(value))) captures.push(JSON.parse(await readFile(path.join(directory, name), 'utf8')));
  if (!captures.length || !process.env.DATABASE_URL) throw new Error('Captures and DATABASE_URL are required.');
  const database = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined });
  try { console.log(JSON.stringify({ applied: apply, ...await repairReviewRatingTokens(captures, database, { apply }) })); }
  catch (error) { console.error('Rating-token repair stopped:', error.message); process.exitCode = 1; }
  finally { await database.end(); }
}
