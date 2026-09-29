import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createLocalFixtureDatabase } from '../support/local-fixture-database.mjs';
import { getPublishedReviews, getReviewPublication, setReviewPublication } from '../../site/src/lib/airbnb-admin/publication.ts';

test('historic approval migration preserves exact content and ratings and never republishes on rerun', { timeout: 90_000, skip: !existsSync('docs/source-material/airbnb/reviews/private-review-manifest.json') && 'Private historical evidence is available only in the owner checkout.' }, async () => {
  const fixture = await createLocalFixtureDatabase('review_publication');
  try {
    const seed = () => execFileSync(process.execPath, ['site/scripts/seed-approved-airbnb-reviews.mjs'], { env: process.env, encoding: 'utf8', stdio: ['ignore','pipe','pipe'] });
    assert.match(seed(), /added 52 publication records/);
    const expected = JSON.parse(await readFile('site/src/data/public-reviews.json', 'utf8')).reviews;
    const summary = JSON.parse(await readFile('site/src/data/public-review-summary.json', 'utf8'));
    const actual = await getPublishedReviews(fixture.database);
    assert.deepEqual([...actual.reviews].sort((a,b) => a.id.localeCompare(b.id)), [...expected].sort((a,b) => a.id.localeCompare(b.id)));
    assert.equal(actual.summary.overallScore, summary.overallScore);
    assert.deepEqual(actual.summary.categories, summary.categories);
    const id = (await fixture.database.query('SELECT public_id FROM airbnb_reviews LIMIT 1')).rows[0].public_id;
    const admin = (await fixture.database.query("INSERT INTO admin_users(email,display_name,password_hash) VALUES('publication@example.test','Fixture','disabled') RETURNING id::text")).rows[0].id;
    const current = await getReviewPublication(id, fixture.database);
    await setReviewPublication({ id, published: false, revision: current.revision, adminUserId: admin }, fixture.database);
    assert.match(seed(), /added 0 publication records/);
    assert.equal((await getPublishedReviews(fixture.database)).reviews.length, 51);
    assert.equal((await fixture.database.query("SELECT count(*)::int count FROM admin_audit_log WHERE action='airbnb_review.unpublish'")).rows[0].count, 1);
    await fixture.database.query("UPDATE airbnb_review_publications SET public_review=public_review || '{\"privateFeedback\":\"must not escape\"}'::jsonb WHERE published");
    await assert.rejects(getPublishedReviews(fixture.database), /prohibited fields/);
  } finally { await fixture.close(); }
});
