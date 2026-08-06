import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';
import {
  archiveLocalGuideEntry,
  changeLocalGuideSlug,
  createLocalGuideDraft,
  editLocalGuideDraft,
  getLocalGuideEntry,
  listLocalGuideRevisions,
  listLocalGuideEntries,
  listPublishedLocalGuideEntries,
  publishLocalGuideEntry,
  resolvePublishedLocalGuideSlug,
  restoreLocalGuideRevision,
  unpublishLocalGuideEntry,
} from '../../src/lib/local-guide/repository.ts';
import { LocalGuideError } from '../../src/lib/local-guide/types.ts';

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

test('Local Guide mutations are transactional, versioned and publication-safe', async () => {
  assert.ok(databaseUrl, 'Set TEST_DATABASE_URL or DATABASE_URL to run the PostgreSQL integration test.');
  const schema = `local_guide_${process.pid}_${crypto.randomBytes(6).toString('hex')}`;
  const control = new Pool({ connectionString: databaseUrl, ssl: databaseSsl(), max: 1 });
  const database = new Pool({ connectionString: scopedDatabaseUrl(databaseUrl, schema), ssl: databaseSsl(), max: 3 });
  try {
    await control.query(`CREATE SCHEMA ${quoteIdentifier(schema)}`);
    const migrationDirectory = new URL('../../db/', import.meta.url);
    for (const filename of (await readdir(migrationDirectory)).filter((name) => name.endsWith('.sql')).sort()) {
      await database.query(await readFile(new URL(filename, migrationDirectory), 'utf8'));
    }
    const admin = await database.query<{ id: string | number }>(
      `INSERT INTO admin_users (email, display_name, password_hash)
       VALUES ('guide@example.invalid', 'Guide Admin', 'not-a-password') RETURNING id`,
    );
    const actor = { type: 'administrator' as const, adminUserId: String(admin.rows[0].id) };
    const content = {
      title: 'A new Kendal place', summary: 'A useful place for guests.', markdownBody: '## Visit\n\nA safe description.',
      categoryId: 'activities', recommended: true,
    };

    const draft = await createLocalGuideDraft({ slug: 'new-kendal-place', content, actor }, database);
    assert.equal(draft.status, 'draft');
    assert.equal(draft.lockVersion, 1);
    assert.equal(draft.workingRevision?.revisionNumber, 1);
    assert.equal(draft.publishedRevision, null);

    const published = await publishLocalGuideEntry({ entryId: draft.id, expectedVersion: 1, actor }, database);
    assert.equal(published.status, 'published');
    assert.equal(published.lockVersion, 2);
    assert.equal(published.publishedRevision?.title, content.title);

    const edited = await editLocalGuideDraft({
      entryId: draft.id, expectedVersion: 2, actor,
      content: { ...content, title: 'A better Kendal place' },
    }, database);
    assert.equal(edited.lockVersion, 3);
    assert.equal(edited.workingRevision?.title, 'A better Kendal place');
    assert.equal(edited.publishedRevision?.title, 'A new Kendal place', 'editing must not alter published content');

    await assert.rejects(
      editLocalGuideDraft({ entryId: draft.id, expectedVersion: 2, actor, content }, database),
      (error: unknown) => error instanceof LocalGuideError && error.code === 'STALE_VERSION' && error.currentVersion === 3,
    );
    assert.equal((await getLocalGuideEntry(draft.id, database))?.workingRevision?.title, 'A better Kendal place');

    const republished = await publishLocalGuideEntry({ entryId: draft.id, expectedVersion: 3, actor }, database);
    assert.equal(republished.publishedRevision?.title, 'A better Kendal place');
    const renamed = await changeLocalGuideSlug({ entryId: draft.id, expectedVersion: 4, slug: 'better-kendal-place', actor }, database);
    assert.equal(renamed.slug, 'better-kendal-place');
    assert.equal((await database.query(`SELECT old_slug FROM local_guide_slug_aliases WHERE local_guide_entry_id=(SELECT id FROM local_guide_entries WHERE public_id=$1)`, [draft.id])).rows[0].old_slug, 'new-kendal-place');
    assert.equal((await resolvePublishedLocalGuideSlug('new-kendal-place', database))?.isAlias, true);
    assert.equal((await resolvePublishedLocalGuideSlug('better-kendal-place', database))?.entry.title, 'A better Kendal place');
    assert.equal((await listPublishedLocalGuideEntries(database)).some((entry) => entry.id === draft.id), true);
    assert.deepEqual((await listLocalGuideRevisions(draft.id, database)).map((item) => item.revisionNumber), [3, 1]);
    assert.equal((await listLocalGuideEntries(database)).some((item) => item.id === draft.id), true);

    const restored = await restoreLocalGuideRevision({
      entryId: draft.id, revisionId: draft.workingRevisionId!, expectedVersion: 5, actor,
    }, database);
    assert.equal(restored.lockVersion, 6);
    assert.equal(restored.workingRevision?.revisionNumber, 6);
    assert.equal(restored.workingRevision?.title, content.title);

    const unpublished = await unpublishLocalGuideEntry({ entryId: draft.id, expectedVersion: 6, actor }, database);
    assert.equal(unpublished.status, 'unpublished');
    assert.ok(unpublished.publishedRevision, 'historical published revision remains linked');
    assert.equal(await resolvePublishedLocalGuideSlug('better-kendal-place', database), null);
    const archived = await archiveLocalGuideEntry({ entryId: draft.id, expectedVersion: 7, actor }, database);
    assert.equal(archived.status, 'archived');
    await assert.rejects(
      editLocalGuideDraft({ entryId: draft.id, expectedVersion: 8, actor, content }, database),
      (error: unknown) => error instanceof LocalGuideError && error.code === 'INVALID_TRANSITION',
    );

    await assert.rejects(
      createLocalGuideDraft({ slug: 'activities', content, actor }, database),
      (error: unknown) => error instanceof LocalGuideError && error.code === 'SLUG_CONFLICT',
    );
    await assert.rejects(
      createLocalGuideDraft({ slug: 'better-kendal-place', content, actor }, database),
      (error: unknown) => error instanceof LocalGuideError && error.code === 'SLUG_CONFLICT',
    );
    await assert.rejects(
      database.query(`UPDATE local_guide_revisions SET title='mutated' WHERE local_guide_entry_id=(SELECT id FROM local_guide_entries WHERE public_id=$1)`, [draft.id]),
      /immutable/,
    );

    const events = await database.query(`SELECT action FROM local_guide_events WHERE local_guide_entry_id=(SELECT id FROM local_guide_entries WHERE public_id=$1) ORDER BY id`, [draft.id]);
    assert.deepEqual(events.rows.map((row) => row.action), ['created', 'published', 'edited', 'published', 'slug_changed', 'revision_restored', 'unpublished', 'archived']);
  } finally {
    await database.end();
    await control.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schema)} CASCADE`);
    await control.end();
  }
});
