import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';

const { Pool } = pg;
const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

function scopedDatabaseUrl(baseUrl: string, schema: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set('options', `-c search_path=${schema},public`);
  return url.toString();
}
function quoteIdentifier(identifier: string): string { return `"${identifier.replaceAll('"', '""')}"`; }
function databaseSsl(): { rejectUnauthorized: false } | undefined {
  return process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined;
}

test('captures and reconciles every legacy Local Guide entry atomically', async () => {
  assert.ok(databaseUrl, 'Set TEST_DATABASE_URL or DATABASE_URL to run the PostgreSQL integration test.');
  const schema = `local_guide_data_${process.pid}_${crypto.randomBytes(6).toString('hex')}`;
  const rollbackSchema = `${schema}_rollback`;
  const control = new Pool({ connectionString: databaseUrl, ssl: databaseSsl(), max: 1 });
  const database = new Pool({ connectionString: scopedDatabaseUrl(databaseUrl, schema), ssl: databaseSsl(), max: 2 });
  const rollbackDatabase = new Pool({ connectionString: scopedDatabaseUrl(databaseUrl, rollbackSchema), ssl: databaseSsl(), max: 1 });
  const migrationDirectory = new URL('../../db/', import.meta.url);
  const filenames = (await readdir(migrationDirectory)).filter((name) => name.endsWith('.sql')).sort();
  const report = JSON.parse(await readFile(new URL('../../src/data/local-guide-migration-report.json', import.meta.url), 'utf8'));
  const baseline = JSON.parse(await readFile(new URL('../../src/data/local-guide-baseline.json', import.meta.url), 'utf8'));
  try {
    await control.query(`CREATE SCHEMA ${quoteIdentifier(schema)}`);
    await control.query(`CREATE SCHEMA ${quoteIdentifier(rollbackSchema)}`);
    for (const filename of filenames) await database.query(await readFile(new URL(filename, migrationDirectory), 'utf8'));

    const counts = await database.query(`
      SELECT count(*)::int entries,
        count(*) FILTER (WHERE status='published')::int published,
        count(DISTINCT canonical_slug)::int slugs
      FROM local_guide_entries`);
    assert.deepEqual(counts.rows[0], { entries: 39, published: 39, slugs: 39 });
    assert.equal(Number((await database.query(`SELECT count(*) FROM local_guide_revisions WHERE revision_number=1 AND actor_type='system' AND source='legacy_markdown_migration'`)).rows[0].count), 39);
    assert.equal(Number((await database.query(`SELECT count(*) FROM local_guide_events WHERE action='created' AND source='legacy_markdown_migration'`)).rows[0].count), 39);
    assert.equal(Number((await database.query(`SELECT count(*) FROM local_guide_entries WHERE working_revision_id=published_revision_id`)).rows[0].count), 39);

    const rows = await database.query(`
      SELECT e.canonical_slug slug, e.legacy_content_id "contentId",
             encode(digest(r.markdown_body, 'sha256'), 'hex') "bodySha256"
        FROM local_guide_entries e JOIN local_guide_revisions r ON r.id=e.published_revision_id
       ORDER BY e.canonical_slug`);
    assert.deepEqual(rows.rows, [...report.entries].sort((left, right) => left.slug.localeCompare(right.slug)).map((entry) => ({
      slug: entry.slug, contentId: entry.contentId, bodySha256: entry.bodySha256,
    })));
    const metadata = await database.query(`
      SELECT e.canonical_slug slug, e.legacy_content_id "contentId", e.legacy_id "legacyId",
             r.title, r.summary, r.legacy_text "legacyText", r.category_id category,
             r.category_label "categoryLabel", r.image_path image, r.external_link "externalLink", r.recommended
        FROM local_guide_entries e JOIN local_guide_revisions r ON r.id=e.published_revision_id
       ORDER BY e.canonical_slug`);
    assert.deepEqual(metadata.rows, [...baseline.entries].sort((left, right) => left.slug.localeCompare(right.slug)).map((entry) => ({
      slug: entry.slug, contentId: entry.contentId, legacyId: entry.legacyId, title: entry.title,
      summary: entry.summary, legacyText: entry.legacyText || null, category: entry.category,
      categoryLabel: entry.categoryLabel, image: entry.image, externalLink: entry.externalLink,
      recommended: entry.recommended,
    })));

    for (const filename of filenames.filter((name) => name < '034_local_guide_content_migration.sql')) {
      await rollbackDatabase.query(await readFile(new URL(filename, migrationDirectory), 'utf8'));
    }
    await rollbackDatabase.query(`INSERT INTO local_guide_entries (canonical_slug) VALUES ('abbothall')`);
    await rollbackDatabase.query('BEGIN');
    await assert.rejects(
      rollbackDatabase.query(await readFile(new URL('034_local_guide_content_migration.sql', migrationDirectory), 'utf8')),
      /duplicate key|already exists/i,
    );
    await rollbackDatabase.query('ROLLBACK');
    assert.equal(Number((await rollbackDatabase.query(`SELECT count(*) FROM local_guide_entries`)).rows[0].count), 1);
    assert.equal((await rollbackDatabase.query(`SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name='local_guide_entries' AND column_name='migration_source_sha256'`, [rollbackSchema])).rowCount, 0);
  } finally {
    await database.end(); await rollbackDatabase.end();
    await control.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schema)} CASCADE`);
    await control.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(rollbackSchema)} CASCADE`);
    await control.end();
  }
});
