import type { Pool, PoolClient } from 'pg';
import { getPool } from '../booking/db.ts';
import { LocalGuideError, type LocalGuideActor, type LocalGuideContentInput, type LocalGuideEntry, type LocalGuidePublishedEntry, type LocalGuideRevision } from './types.ts';
import { validateAdminActor, validateContent, validatePublicId, validateSlug } from './validation.ts';

type Database = Pick<Pool, 'query' | 'connect'>;
type EntryRow = Record<string, any>;

function iso(value: Date | string | null): string | null {
  return value == null ? null : new Date(value).toISOString();
}

function revision(row: EntryRow, prefix: 'working' | 'published'): LocalGuideRevision | null {
  if (row[`${prefix}_revision_id`] == null) return null;
  return {
    id: String(row[`${prefix}_revision_id`]),
    revisionNumber: row[`${prefix}_revision_number`],
    title: row[`${prefix}_title`], summary: row[`${prefix}_summary`], markdownBody: row[`${prefix}_markdown_body`],
    bodyFormat: row[`${prefix}_body_format`], categoryId: row[`${prefix}_category_id`],
    categoryLabel: row[`${prefix}_category_label`], imagePath: row[`${prefix}_image_path`],
    externalLink: row[`${prefix}_external_link`], recommended: row[`${prefix}_recommended`],
    legacyText: row[`${prefix}_legacy_text`], actorType: row[`${prefix}_actor_type`],
    source: row[`${prefix}_source`], action: row[`${prefix}_action`], createdAt: iso(row[`${prefix}_created_at`])!,
  };
}

const entrySelect = `
  SELECT e.*,
    wr.revision_number working_revision_number, wr.title working_title, wr.summary working_summary,
    wr.markdown_body working_markdown_body, wr.body_format working_body_format, wr.category_id working_category_id,
    wr.category_label working_category_label, wr.image_path working_image_path, wr.external_link working_external_link,
    wr.recommended working_recommended, wr.legacy_text working_legacy_text, wr.actor_type working_actor_type,
    wr.source working_source, wr.action working_action, wr.created_at working_created_at,
    pr.revision_number published_revision_number, pr.title published_title, pr.summary published_summary,
    pr.markdown_body published_markdown_body, pr.body_format published_body_format, pr.category_id published_category_id,
    pr.category_label published_category_label, pr.image_path published_image_path, pr.external_link published_external_link,
    pr.recommended published_recommended, pr.legacy_text published_legacy_text, pr.actor_type published_actor_type,
    pr.source published_source, pr.action published_action, pr.created_at published_created_at
  FROM local_guide_entries e
  LEFT JOIN local_guide_revisions wr ON wr.id = e.working_revision_id
  LEFT JOIN local_guide_revisions pr ON pr.id = e.published_revision_id`;

function mapEntry(row: EntryRow): LocalGuideEntry {
  return {
    id: row.public_id, slug: row.canonical_slug, legacyContentId: row.legacy_content_id, legacyId: row.legacy_id,
    status: row.status, lockVersion: row.lock_version,
    workingRevisionId: row.working_revision_id == null ? null : String(row.working_revision_id),
    publishedRevisionId: row.published_revision_id == null ? null : String(row.published_revision_id),
    workingRevision: revision(row, 'working'), publishedRevision: revision(row, 'published'),
    publishedAt: iso(row.published_at), unpublishedAt: iso(row.unpublished_at), archivedAt: iso(row.archived_at),
    createdAt: iso(row.created_at)!, updatedAt: iso(row.updated_at)!,
  };
}

function translate(error: unknown): never {
  const pgError = error as { code?: string; constraint?: string; message?: string };
  if (pgError.code === '23505' || /slug collides/i.test(pgError.message ?? '')) {
    throw new LocalGuideError('SLUG_CONFLICT', 'That slug is already reserved.');
  }
  throw error;
}

async function inTransaction<T>(database: Database, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    return translate(error);
  } finally { client.release(); }
}

async function lockedEntry(client: PoolClient, publicId: string, expectedVersion: number): Promise<EntryRow> {
  const result = await client.query(`SELECT * FROM local_guide_entries WHERE public_id = $1::uuid FOR UPDATE`, [validatePublicId(publicId)]);
  if (!result.rowCount) throw new LocalGuideError('NOT_FOUND', 'Local Guide entry was not found.');
  if (result.rows[0].lock_version !== expectedVersion) {
    throw new LocalGuideError('STALE_VERSION', 'The Local Guide entry has changed. Reload it before saving.', result.rows[0].lock_version);
  }
  return result.rows[0];
}

async function addEvent(client: PoolClient, entryId: string, revisionNumber: number, actor: LocalGuideActor, action: string, details: object = {}) {
  await client.query(
    `INSERT INTO local_guide_events
      (local_guide_entry_id, revision_number, actor_type, admin_user_id, source, action, details)
     VALUES ($1, $2, 'administrator', $3, $4, $5, $6::jsonb)`,
    [entryId, revisionNumber, actor.adminUserId, actor.source, action, JSON.stringify(details)],
  );
}

async function insertRevision(client: PoolClient, entryId: string, revisionNumber: number, content: ReturnType<typeof validateContent>, actor: LocalGuideActor, action: string) {
  const category = await client.query(`SELECT id FROM local_guide_categories WHERE id=$1 AND NOT working_deleted`, [content.categoryId]);
  if (!category.rowCount) throw new LocalGuideError('VALIDATION_ERROR', 'Category is unavailable in the working draft.');
  return client.query<{ id: string | number }>(
    `INSERT INTO local_guide_revisions
      (local_guide_entry_id, revision_number, title, summary, markdown_body, category_id, category_label,
       image_path, external_link, recommended, legacy_text, actor_type, admin_user_id, source, action)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'administrator',$12,$13,$14) RETURNING id`,
    [entryId, revisionNumber, content.title, content.summary, content.markdownBody, content.categoryId,
      content.categoryLabel, content.imagePath, content.externalLink, content.recommended, content.legacyText,
      actor.adminUserId, actor.source, action],
  );
}

export async function getLocalGuideEntry(publicId: string, database: Pick<Pool, 'query'> = getPool()): Promise<LocalGuideEntry | null> {
  const result = await database.query(`${entrySelect} WHERE e.public_id = $1::uuid`, [validatePublicId(publicId)]);
  return result.rowCount ? mapEntry(result.rows[0]) : null;
}

export async function listLocalGuideEntries(database: Pick<Pool, 'query'> = getPool()): Promise<LocalGuideEntry[]> {
  const result = await database.query(`${entrySelect} ORDER BY COALESCE(wr.title, pr.title) COLLATE "C", e.canonical_slug`);
  return result.rows.map(mapEntry);
}

export async function listLocalGuideRevisions(publicId: string, database: Pick<Pool, 'query'> = getPool()): Promise<LocalGuideRevision[]> {
  const result = await database.query(
    `SELECT r.* FROM local_guide_revisions r
      JOIN local_guide_entries e ON e.id=r.local_guide_entry_id
     WHERE e.public_id=$1::uuid ORDER BY r.revision_number DESC`, [validatePublicId(publicId)],
  );
  return result.rows.map((row) => ({
    id: String(row.id), revisionNumber: row.revision_number, title: row.title, summary: row.summary,
    markdownBody: row.markdown_body, bodyFormat: row.body_format, categoryId: row.category_id,
    categoryLabel: row.category_label, imagePath: row.image_path, externalLink: row.external_link,
    recommended: row.recommended, legacyText: row.legacy_text, actorType: row.actor_type,
    source: row.source, action: row.action, createdAt: iso(row.created_at)!,
  }));
}

function publishedEntry(row: EntryRow): LocalGuidePublishedEntry {
  return {
    id: row.public_id, slug: row.canonical_slug, title: row.title, summary: row.summary,
    markdownBody: row.markdown_body, categoryId: row.category_id, categoryLabel: row.category_label,
    imagePath: row.image_path, externalLink: row.external_link, recommended: row.recommended,
    revisionNumber: row.revision_number, publishedAt: iso(row.published_at)!,
  };
}

export async function listPublishedLocalGuideEntries(database: Pick<Pool, 'query'> = getPool()): Promise<LocalGuidePublishedEntry[]> {
  const result = await database.query(
    `SELECT e.public_id::text, e.canonical_slug, e.published_at,
            r.title, r.summary, r.markdown_body, r.category_id, r.category_label,
            r.image_path, r.external_link, r.recommended, r.revision_number
       FROM local_guide_entries e JOIN local_guide_revisions r ON r.id=e.published_revision_id
      WHERE e.status='published' ORDER BY r.title COLLATE "C", e.canonical_slug`,
  );
  return result.rows.map(publishedEntry);
}

export async function resolvePublishedLocalGuideSlug(slugValue: string, database: Pick<Pool, 'query'> = getPool()): Promise<{ entry: LocalGuidePublishedEntry; isAlias: boolean } | null> {
  const slug = validateSlug(slugValue);
  const result = await database.query(
    `SELECT e.public_id::text, e.canonical_slug, e.published_at,
            r.title, r.summary, r.markdown_body, r.category_id, r.category_label,
            r.image_path, r.external_link, r.recommended, r.revision_number,
            COALESCE(lower(a.old_slug)=lower($1), FALSE) AS is_alias
       FROM local_guide_entries e
       JOIN local_guide_revisions r ON r.id=e.published_revision_id
       LEFT JOIN local_guide_slug_aliases a ON a.local_guide_entry_id=e.id AND lower(a.old_slug)=lower($1)
      WHERE e.status='published' AND (lower(e.canonical_slug)=lower($1) OR a.id IS NOT NULL)`, [slug],
  );
  return result.rowCount ? { entry: publishedEntry(result.rows[0]), isAlias: result.rows[0].is_alias } : null;
}

export async function createLocalGuideDraft(input: {
  slug: string; legacyContentId?: string | null; legacyId?: string | null; content: LocalGuideContentInput; actor: LocalGuideActor;
}, database: Database = getPool()): Promise<LocalGuideEntry> {
  const slug = validateSlug(input.slug); const content = validateContent(input.content); const actor = validateAdminActor(input.actor);
  const publicId = await inTransaction(database, async (client) => {
    const categorySlug = await client.query(`SELECT 1 FROM local_guide_categories WHERE id=$1 AND NOT working_deleted`, [slug]);
    if (categorySlug.rowCount) throw new LocalGuideError('SLUG_CONFLICT', 'Slug conflicts with a Local Guide category route.');
    const created = await client.query(
      `INSERT INTO local_guide_entries
        (canonical_slug, legacy_content_id, legacy_id, created_by_admin_user_id, updated_by_admin_user_id)
       VALUES ($1,$2,$3,$4,$4) RETURNING id, public_id::text`,
      [slug, input.legacyContentId ?? null, input.legacyId ?? null, actor.adminUserId],
    );
    const entryId = String(created.rows[0].id);
    const inserted = await insertRevision(client, entryId, 1, content, actor, 'created');
    await client.query(`UPDATE local_guide_entries SET working_revision_id=$2 WHERE id=$1`, [entryId, inserted.rows[0].id]);
    await addEvent(client, entryId, 1, actor, 'created');
    await client.query(`UPDATE local_guide_workspace SET lock_version=lock_version+1,updated_by_admin_user_id=$1,updated_at=NOW() WHERE singleton`,[actor.adminUserId]);
    return created.rows[0].public_id;
  });
  return (await getLocalGuideEntry(publicId, database))!;
}

export async function editLocalGuideDraft(input: {
  entryId: string; expectedVersion: number; content: LocalGuideContentInput; actor: LocalGuideActor;
}, database: Database = getPool()): Promise<LocalGuideEntry> {
  const content = validateContent(input.content); const actor = validateAdminActor(input.actor);
  await inTransaction(database, async (client) => {
    const entry = await lockedEntry(client, input.entryId, input.expectedVersion);
    if (entry.status === 'archived') throw new LocalGuideError('INVALID_TRANSITION', 'Archived entries are read-only.');
    const revisionNumber = input.expectedVersion + 1;
    const inserted = await insertRevision(client, String(entry.id), revisionNumber, content, actor, 'edited');
    await client.query(
      `UPDATE local_guide_entries SET working_revision_id=$2, lock_version=$3,
       updated_by_admin_user_id=$4, updated_at=NOW() WHERE id=$1`,
      [entry.id, inserted.rows[0].id, revisionNumber, actor.adminUserId],
    );
    await addEvent(client, String(entry.id), revisionNumber, actor, 'edited');
    await client.query(`UPDATE local_guide_workspace SET lock_version=lock_version+1,updated_by_admin_user_id=$1,updated_at=NOW() WHERE singleton`,[actor.adminUserId]);
  });
  return (await getLocalGuideEntry(input.entryId, database))!;
}

export async function publishLocalGuideEntry(input: { entryId: string; expectedVersion: number; actor: LocalGuideActor }, database: Database = getPool()) {
  const actor = validateAdminActor(input.actor);
  await inTransaction(database, async (client) => {
    const entry = await lockedEntry(client, input.entryId, input.expectedVersion);
    if (entry.status === 'archived' || !entry.working_revision_id) throw new LocalGuideError('INVALID_TRANSITION', 'This entry cannot be published.');
    const nextVersion = input.expectedVersion + 1;
    await client.query(
      `UPDATE local_guide_entries SET status='published', published_revision_id=working_revision_id,
       lock_version=$2, published_at=NOW(), unpublished_at=NULL, updated_by_admin_user_id=$3, updated_at=NOW() WHERE id=$1`,
      [entry.id, nextVersion, actor.adminUserId],
    );
    await addEvent(client, String(entry.id), nextVersion, actor, 'published', { publishedRevisionId: String(entry.working_revision_id) });
  });
  return (await getLocalGuideEntry(input.entryId, database))!;
}

export async function unpublishLocalGuideEntry(input: { entryId: string; expectedVersion: number; actor: LocalGuideActor }, database: Database = getPool()) {
  const actor = validateAdminActor(input.actor);
  await inTransaction(database, async (client) => {
    const entry = await lockedEntry(client, input.entryId, input.expectedVersion);
    if (entry.status !== 'published') throw new LocalGuideError('INVALID_TRANSITION', 'Only a published entry can be unpublished.');
    const nextVersion = input.expectedVersion + 1;
    await client.query(`UPDATE local_guide_entries SET status='unpublished', lock_version=$2, unpublished_at=NOW(), updated_by_admin_user_id=$3, updated_at=NOW() WHERE id=$1`, [entry.id, nextVersion, actor.adminUserId]);
    await addEvent(client, String(entry.id), nextVersion, actor, 'unpublished');
  });
  return (await getLocalGuideEntry(input.entryId, database))!;
}

export async function archiveLocalGuideEntry(input: { entryId: string; expectedVersion: number; actor: LocalGuideActor }, database: Database = getPool()) {
  const actor = validateAdminActor(input.actor);
  await inTransaction(database, async (client) => {
    const entry = await lockedEntry(client, input.entryId, input.expectedVersion);
    if (entry.status === 'archived') throw new LocalGuideError('INVALID_TRANSITION', 'Entry is already archived.');
    const nextVersion = input.expectedVersion + 1;
    await client.query(
      `UPDATE local_guide_entries SET status='archived', lock_version=$2, archived_at=NOW(),
       unpublished_at=CASE WHEN status='published' THEN NOW() ELSE unpublished_at END,
       updated_by_admin_user_id=$3, updated_at=NOW() WHERE id=$1`, [entry.id, nextVersion, actor.adminUserId],
    );
    await addEvent(client, String(entry.id), nextVersion, actor, 'archived');
    await client.query(`UPDATE local_guide_workspace SET lock_version=lock_version+1,updated_by_admin_user_id=$1,updated_at=NOW() WHERE singleton`,[actor.adminUserId]);
  });
  return (await getLocalGuideEntry(input.entryId, database))!;
}

export async function changeLocalGuideSlug(input: { entryId: string; expectedVersion: number; slug: string; actor: LocalGuideActor }, database: Database = getPool()) {
  const slug = validateSlug(input.slug); const actor = validateAdminActor(input.actor);
  await inTransaction(database, async (client) => {
    const entry = await lockedEntry(client, input.entryId, input.expectedVersion);
    if (entry.status === 'archived') throw new LocalGuideError('INVALID_TRANSITION', 'Archived entries are read-only.');
    if (entry.canonical_slug === slug) throw new LocalGuideError('VALIDATION_ERROR', 'The canonical slug is unchanged.');
    const categorySlug=await client.query(`SELECT 1 FROM local_guide_categories WHERE id=$1 AND NOT working_deleted`,[slug]);
    if(categorySlug.rowCount)throw new LocalGuideError('SLUG_CONFLICT','Slug conflicts with a Local Guide category route.');
    const nextVersion = input.expectedVersion + 1;
    await client.query(`UPDATE local_guide_entries SET canonical_slug=$2, lock_version=$3, updated_by_admin_user_id=$4, updated_at=NOW() WHERE id=$1`, [entry.id, slug, nextVersion, actor.adminUserId]);
    await client.query(`INSERT INTO local_guide_slug_aliases (old_slug, local_guide_entry_id, created_by_admin_user_id) VALUES ($1,$2,$3)`, [entry.canonical_slug, entry.id, actor.adminUserId]);
    await addEvent(client, String(entry.id), nextVersion, actor, 'slug_changed', { from: entry.canonical_slug, to: slug });
    await client.query(`UPDATE local_guide_workspace SET lock_version=lock_version+1,updated_by_admin_user_id=$1,updated_at=NOW() WHERE singleton`,[actor.adminUserId]);
  });
  return (await getLocalGuideEntry(input.entryId, database))!;
}

export async function restoreLocalGuideRevision(input: {
  entryId: string; revisionId: string; expectedVersion: number; actor: LocalGuideActor;
}, database: Database = getPool()): Promise<LocalGuideEntry> {
  const actor = validateAdminActor(input.actor);
  await inTransaction(database, async (client) => {
    const entry = await lockedEntry(client, input.entryId, input.expectedVersion);
    if (entry.status === 'archived') throw new LocalGuideError('INVALID_TRANSITION', 'Archived entries are read-only.');
    const source = await client.query(
      `SELECT r.* FROM local_guide_revisions r
        WHERE r.id=$1::bigint AND r.local_guide_entry_id=$2`, [input.revisionId, entry.id],
    );
    if (!source.rowCount) throw new LocalGuideError('NOT_FOUND', 'Local Guide revision was not found.');
    const row = source.rows[0]; const revisionNumber = input.expectedVersion + 1;
    const inserted = await insertRevision(client, String(entry.id), revisionNumber, {
      title: row.title, summary: row.summary, markdownBody: row.markdown_body,
      categoryId: row.category_id, categoryLabel: row.category_label, imagePath: row.image_path,
      externalLink: row.external_link, recommended: row.recommended, legacyText: row.legacy_text,
    }, actor, 'revision_restored');
    await client.query(
      `UPDATE local_guide_entries SET working_revision_id=$2, lock_version=$3,
       updated_by_admin_user_id=$4, updated_at=NOW() WHERE id=$1`,
      [entry.id, inserted.rows[0].id, revisionNumber, actor.adminUserId],
    );
    await addEvent(client, String(entry.id), revisionNumber, actor, 'revision_restored', { sourceRevisionId: String(row.id), sourceRevisionNumber: row.revision_number });
    await client.query(`UPDATE local_guide_workspace SET lock_version=lock_version+1,updated_by_admin_user_id=$1,updated_at=NOW() WHERE singleton`,[actor.adminUserId]);
  });
  return (await getLocalGuideEntry(input.entryId, database))!;
}
