import type { Pool, PoolClient } from 'pg';

type Database = Pick<Pool, 'query' | 'connect'>;
export type LocalGuideExport = {
  format: 'olrigbank-local-guide'; version: 1;
  administrators: Record<string, unknown>[]; entries: Record<string, unknown>[];
  revisions: Record<string, unknown>[]; aliases: Record<string, unknown>[];
  events: Record<string, unknown>[]; contributionProvenance: Record<string, unknown>[];
};

async function rows(database: Pick<Pool,'query'>, sql: string) {
  return (await database.query<{ value: Record<string,unknown> }>(sql)).rows.map(row=>row.value);
}

export async function exportLocalGuide(database: Pick<Pool,'query'>): Promise<LocalGuideExport> {
  const [administrators,entries,revisions,aliases,events,contributionProvenance]=await Promise.all([
    rows(database,`SELECT to_jsonb(a) - 'password_hash' AS value FROM admin_users a WHERE a.id IN (
      SELECT admin_user_id FROM local_guide_revisions WHERE admin_user_id IS NOT NULL UNION SELECT admin_user_id FROM local_guide_events WHERE admin_user_id IS NOT NULL UNION SELECT created_by_admin_user_id FROM local_guide_slug_aliases WHERE created_by_admin_user_id IS NOT NULL) ORDER BY a.id`),
    rows(database,`SELECT to_jsonb(e) AS value FROM local_guide_entries e ORDER BY e.id`),
    rows(database,`SELECT to_jsonb(r) AS value FROM local_guide_revisions r ORDER BY r.local_guide_entry_id,r.revision_number`),
    rows(database,`SELECT to_jsonb(a) AS value FROM local_guide_slug_aliases a ORDER BY a.id`),
    rows(database,`SELECT to_jsonb(e) AS value FROM local_guide_events e ORDER BY e.id`),
    rows(database,`SELECT jsonb_build_object('candidatePublicId',c.public_id,'entryPublicId',e.public_id,'revisionId',c.result_local_guide_revision_id,
      'consentVersion',c.consent_version,'consentStatement',c.consent_statement,'consentedAt',c.consented_at,'attributionPermitted',c.attribution_permitted,
      'attributionName',c.attribution_name,'status',c.status,'reviewedAt',c.reviewed_at) AS value
      FROM guide_contribution_candidates c JOIN local_guide_entries e ON e.id=c.result_local_guide_entry_id ORDER BY c.id`),
  ]);
  return {format:'olrigbank-local-guide',version:1,administrators,entries,revisions,aliases,events,contributionProvenance};
}

async function insertJson(client: PoolClient, table: string, values: Record<string,unknown>[]) {
  for(const value of values) await client.query(`INSERT INTO ${table} SELECT * FROM jsonb_populate_record(NULL::${table},$1::jsonb)`,[JSON.stringify(value)]);
}

export async function restoreLocalGuide(data: LocalGuideExport,database: Database): Promise<void> {
  if(data.format!=='olrigbank-local-guide'||data.version!==1)throw new Error('Unsupported Local Guide export format.');
  const client=await database.connect();
  try{
    await client.query('BEGIN');
    const count=await client.query(`SELECT (SELECT count(*) FROM local_guide_entries)+(SELECT count(*) FROM local_guide_revisions)+(SELECT count(*) FROM local_guide_slug_aliases)+(SELECT count(*) FROM local_guide_events) AS count`);
    if(Number(count.rows[0].count)!==0)throw new Error('Local Guide restore requires empty Local Guide tables.');
    for(const admin of data.administrators)await client.query(`INSERT INTO admin_users(id,email,display_name,password_hash,role,active,created_at,updated_at,last_login_at)
      VALUES($1,$2,$3,'recovery-disabled',$4,$5,$6,$7,$8) ON CONFLICT(id) DO NOTHING`,[admin.id,admin.email,admin.display_name,admin.role,admin.active,admin.created_at,admin.updated_at,admin.last_login_at]);
    const pointers=new Map(data.entries.map(entry=>[String(entry.id),{working:entry.working_revision_id,published:entry.published_revision_id,status:entry.status,publishedAt:entry.published_at,unpublishedAt:entry.unpublished_at,archivedAt:entry.archived_at}]));
    await insertJson(client,'local_guide_entries',data.entries.map(entry=>({...entry,status:'draft',working_revision_id:null,published_revision_id:null,published_at:null,unpublished_at:null,archived_at:null})));
    await insertJson(client,'local_guide_revisions',data.revisions);
    for(const [id,pointer] of pointers)await client.query(`UPDATE local_guide_entries SET working_revision_id=$2,published_revision_id=$3,status=$4,published_at=$5,unpublished_at=$6,archived_at=$7 WHERE id=$1`,[id,pointer.working,pointer.published,pointer.status,pointer.publishedAt,pointer.unpublishedAt,pointer.archivedAt]);
    await insertJson(client,'local_guide_slug_aliases',data.aliases);await insertJson(client,'local_guide_events',data.events);
    for(const table of ['admin_users','local_guide_entries','local_guide_revisions','local_guide_slug_aliases','local_guide_events'])await client.query(`SELECT setval(pg_get_serial_sequence($1,'id'),COALESCE((SELECT max(id) FROM ${table}),1),TRUE)`,[table]);
    await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
}
