import { getPool } from '../booking/db.ts';
import { OCCUPANCY_SUBJECTS, type OccupancyExceedOutcome, type OccupancyPolicy, type OccupancyRule, type OccupancySubject } from './types.ts';

type Database = { query: (text: string, values?: unknown[]) => Promise<any> };
const database = (provided?: Database): Database => provided ?? getPool();
const iso = (value: unknown): string => new Date(value as string).toISOString();

function rule(row: any): OccupancyRule {
  return { id: String(row.id), policyId: String(row.policy_id), subject: row.subject,
    maximumStandardCount: Number(row.maximum_standard_count), exceedOutcome: row.exceed_outcome };
}

async function hydrate(row: any, db: Database): Promise<OccupancyPolicy> {
  const rules = await db.query('SELECT * FROM occupancy_rules WHERE policy_id=$1 ORDER BY id', [row.id]);
  return { id: String(row.id), propertyId: row.property_id, name: row.name, status: row.status,
    version: Number(row.version), basedOnPolicyId: row.based_on_policy_id == null ? null : String(row.based_on_policy_id),
    publishedAt: row.published_at ? iso(row.published_at) : null, createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at), rules: rules.rows.map(rule) };
}

export async function listOccupancyPolicies(propertyId: string, provided?: Database): Promise<OccupancyPolicy[]> {
  const db=database(provided); const rows=await db.query(`SELECT * FROM occupancy_policies WHERE property_id=$1
    ORDER BY CASE status WHEN 'draft' THEN 0 WHEN 'published' THEN 1 ELSE 2 END, version DESC`,[propertyId]);
  return Promise.all(rows.rows.map((row:any)=>hydrate(row,db)));
}

export async function getOccupancyPolicy(id: string, provided?: Database): Promise<OccupancyPolicy|null> {
  const db=database(provided); const result=await db.query('SELECT * FROM occupancy_policies WHERE id=$1',[id]);
  return result.rowCount ? hydrate(result.rows[0],db) : null;
}

export async function getPublishedOccupancyPolicy(propertyId:string,provided?:Database):Promise<OccupancyPolicy|null>{
  const db=database(provided);const result=await db.query("SELECT * FROM occupancy_policies WHERE property_id=$1 AND status='published'",[propertyId]);
  return result.rowCount?hydrate(result.rows[0],db):null;
}

export async function createOccupancyPolicy(propertyId:string,name:string,adminUserId:string,provided?:Database):Promise<OccupancyPolicy>{
  const db=database(provided);const result=await db.query(`INSERT INTO occupancy_policies(property_id,name,status,version,created_by)
    SELECT $1,$2,'draft',COALESCE(MAX(version),0)+1,$3 FROM occupancy_policies WHERE property_id=$1 RETURNING *`,[propertyId,name.trim().slice(0,160),adminUserId]);
  await db.query("INSERT INTO occupancy_policy_events(policy_id,admin_user_id,action) VALUES($1,$2,'created')",[result.rows[0].id,adminUserId]);
  return hydrate(result.rows[0],db);
}

export async function duplicateOccupancyPolicy(id:string,adminUserId:string,provided?:Database):Promise<OccupancyPolicy>{
  const client=provided?null:await getPool().connect();const db=provided??client!;await db.query('BEGIN');try{const source=await db.query('SELECT * FROM occupancy_policies WHERE id=$1 FOR SHARE',[id]);if(!source.rowCount)throw new Error('POLICY_NOT_FOUND');
    const s=source.rows[0];const created=await db.query(`INSERT INTO occupancy_policies(property_id,name,status,version,based_on_policy_id,created_by)
      SELECT $1,$2,'draft',COALESCE(MAX(version),0)+1,$3,$4 FROM occupancy_policies WHERE property_id=$1 RETURNING *`,[s.property_id,`${s.name.replace(/ — draft.*$/u,'')} — draft`,s.id,adminUserId]);
    await db.query(`INSERT INTO occupancy_rules(policy_id,subject,maximum_standard_count,exceed_outcome)
      SELECT $1,subject,maximum_standard_count,exceed_outcome FROM occupancy_rules WHERE policy_id=$2`,[created.rows[0].id,id]);
    await db.query("INSERT INTO occupancy_policy_events(policy_id,admin_user_id,action,details) VALUES($1,$2,'duplicated',jsonb_build_object('sourcePolicyId',$3::text))",[created.rows[0].id,adminUserId,id]);await db.query('COMMIT');return hydrate(created.rows[0],db);
  }catch(error){await db.query('ROLLBACK');throw error;}finally{client?.release();}}

export async function upsertOccupancyRule(input:{policyId:string;subject:OccupancySubject;maximumStandardCount:number;exceedOutcome:OccupancyExceedOutcome;adminUserId:string},provided?:Database):Promise<OccupancyRule>{
  if(!OCCUPANCY_SUBJECTS.includes(input.subject)||!Number.isInteger(input.maximumStandardCount)||input.maximumStandardCount<0||!['bespoke','host_decision_required'].includes(input.exceedOutcome))throw new Error('INVALID_OCCUPANCY_RULE');
  const db=database(provided);const result=await db.query(`INSERT INTO occupancy_rules(policy_id,subject,maximum_standard_count,exceed_outcome)
    SELECT id,$2,$3,$4 FROM occupancy_policies WHERE id=$1 AND status='draft'
    ON CONFLICT(policy_id,subject) DO UPDATE SET maximum_standard_count=EXCLUDED.maximum_standard_count,exceed_outcome=EXCLUDED.exceed_outcome,updated_at=NOW() RETURNING *`,[input.policyId,input.subject,input.maximumStandardCount,input.exceedOutcome]);
  if(!result.rowCount)throw new Error('DRAFT_POLICY_NOT_FOUND');await db.query("UPDATE occupancy_policies SET updated_at=NOW() WHERE id=$1",[input.policyId]);
  await db.query("INSERT INTO occupancy_policy_events(policy_id,admin_user_id,action,details) VALUES($1,$2,'rule_updated',jsonb_build_object('subject',$3::text))",[input.policyId,input.adminUserId,input.subject]);return rule(result.rows[0]);
}

export async function publishOccupancyPolicy(id:string,adminUserId:string,provided?:Database):Promise<void>{
  const client=provided?null:await getPool().connect();const db=provided??client!;await db.query('BEGIN');try{const selected=await db.query("SELECT * FROM occupancy_policies WHERE id=$1 AND status='draft' FOR UPDATE",[id]);if(!selected.rowCount)throw new Error('DRAFT_POLICY_NOT_FOUND');
    const count=await db.query('SELECT COUNT(DISTINCT subject)::int AS count FROM occupancy_rules WHERE policy_id=$1',[id]);if(Number(count.rows[0].count)!==OCCUPANCY_SUBJECTS.length)throw new Error('OCCUPANCY_POLICY_INCOMPLETE');
    const propertyId=selected.rows[0].property_id;const archived=await db.query("UPDATE occupancy_policies SET status='archived',updated_at=NOW() WHERE property_id=$1 AND status='published' RETURNING id",[propertyId]);
    for(const row of archived.rows)await db.query("INSERT INTO occupancy_policy_events(policy_id,admin_user_id,action) VALUES($1,$2,'archived')",[row.id,adminUserId]);
    await db.query("UPDATE occupancy_policies SET status='published',published_by=$2,published_at=NOW(),updated_at=NOW() WHERE id=$1",[id,adminUserId]);await db.query("INSERT INTO occupancy_policy_events(policy_id,admin_user_id,action) VALUES($1,$2,'published')",[id,adminUserId]);await db.query('COMMIT');
  }catch(error){await db.query('ROLLBACK');throw error;}finally{client?.release();}}
