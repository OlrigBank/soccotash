import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';
import { getHolidayPlan, setPlanItemGuideReference } from '../../src/lib/planner/repository.ts';
import { PlannerError } from '../../src/lib/planner/types.ts';

const { Pool } = pg;
const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
function scopedDatabaseUrl(baseUrl:string,schema:string){const url=new URL(baseUrl);url.searchParams.set('options',`-c search_path=${schema},public`);return url.toString()}
function quoteIdentifier(value:string){return `"${value.replaceAll('"','""')}"`}
function databaseSsl():{rejectUnauthorized:false}|undefined{return process.env.DATABASE_SSL==='true'?{rejectUnauthorized:false}:undefined}

async function seedPlan(database:pg.Pool, guideSlug:string) {
  const admin=await database.query(`INSERT INTO admin_users(email,display_name,password_hash) VALUES($1,'Guide Admin','hash') RETURNING id`,[`${crypto.randomUUID()}@example.invalid`]);
  const plan=await database.query(`INSERT INTO holiday_plans(plan_type,title,created_by_admin_user_id,updated_by_admin_user_id) VALUES('example','Stable guide plan',$1,$1) RETURNING id,public_id::text`,[admin.rows[0].id]);
  const day=await database.query(`INSERT INTO plan_days(holiday_plan_id,title,position) VALUES($1,'Day one',10) RETURNING id`,[plan.rows[0].id]);
  const linked=await database.query(`INSERT INTO plan_items(plan_day_id,title,item_type,local_guide_slug,position) VALUES($1,'Castle','activity',$2,10) RETURNING public_id::text`,[day.rows[0].id,guideSlug]);
  const custom=await database.query(`INSERT INTO plan_items(plan_day_id,title,item_type,position) VALUES($1,'Custom','activity',20) RETURNING public_id::text`,[day.rows[0].id]);
  return {adminId:String(admin.rows[0].id),planId:plan.rows[0].public_id,linkedItemId:linked.rows[0].public_id,customItemId:custom.rows[0].public_id};
}

test('backfills stable guide IDs, survives slug changes and rejects unresolved migration references',async()=>{
  assert.ok(databaseUrl,'Set TEST_DATABASE_URL or DATABASE_URL to run the PostgreSQL integration test.');
  const schema=`planner_guide_${process.pid}_${crypto.randomBytes(5).toString('hex')}`;const badSchema=`${schema}_bad`;
  const control=new Pool({connectionString:databaseUrl,ssl:databaseSsl(),max:1});
  const database=new Pool({connectionString:scopedDatabaseUrl(databaseUrl,schema),ssl:databaseSsl(),max:2});
  const badDatabase=new Pool({connectionString:scopedDatabaseUrl(databaseUrl,badSchema),ssl:databaseSsl(),max:1});
  const directory=new URL('../../db/',import.meta.url);const files=(await readdir(directory)).filter(name=>name.endsWith('.sql')).sort();
  const beforeReference=files.filter(name=>name<'035_planner_local_guide_entry_references.sql');
  const referenceMigration=await readFile(new URL('035_planner_local_guide_entry_references.sql',directory),'utf8');
  try{
    await control.query(`CREATE SCHEMA ${quoteIdentifier(schema)}`);await control.query(`CREATE SCHEMA ${quoteIdentifier(badSchema)}`);
    for(const filename of beforeReference){const sql=await readFile(new URL(filename,directory),'utf8');await database.query(sql);await badDatabase.query(sql)}
    const seeded=await seedPlan(database,'kendalcastle');
    await database.query(referenceMigration);
    const initial=await getHolidayPlan(seeded.planId,database);const item=initial!.days[0].items[0];
    assert.match(item.localGuideEntryId!,/^[0-9a-f-]{36}$/);assert.equal(item.localGuideSlug,'kendalcastle');assert.equal(item.localGuideSlugSnapshot,'kendalcastle');

    await database.query(`UPDATE local_guide_entries SET canonical_slug='kendal-castle-current' WHERE public_id=$1::uuid`,[item.localGuideEntryId]);
    const renamed=(await getHolidayPlan(seeded.planId,database))!.days[0].items[0];
    assert.equal(renamed.localGuideEntryId,item.localGuideEntryId);assert.equal(renamed.localGuideSlug,'kendal-castle-current');assert.equal(renamed.localGuideSlugSnapshot,'kendalcastle');

    await database.query(`UPDATE local_guide_entries SET status='unpublished',unpublished_at=NOW() WHERE public_id=$1::uuid`,[item.localGuideEntryId]);
    assert.equal((await getHolidayPlan(seeded.planId,database))!.days[0].items[0].localGuideEntryId,item.localGuideEntryId,'historical reference remains readable');
    await assert.rejects(setPlanItemGuideReference({planId:seeded.planId,itemId:seeded.customItemId,localGuideEntryId:item.localGuideEntryId,expectedRevision:1,actor:{type:'administrator',adminUserId:seeded.adminId}},database),(error:unknown)=>error instanceof PlannerError&&error.code==='VALIDATION_ERROR');

    await seedPlan(badDatabase,'does-not-exist');await badDatabase.query('BEGIN');
    await assert.rejects(badDatabase.query(referenceMigration),/unresolved Local Guide plan references/);await badDatabase.query('ROLLBACK');
    assert.equal((await badDatabase.query(`SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name='plan_items' AND column_name='local_guide_entry_id'`,[badSchema])).rowCount,0);
  }finally{await database.end();await badDatabase.end();await control.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schema)} CASCADE`);await control.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(badSchema)} CASCADE`);await control.end()}
});
