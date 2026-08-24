import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readdir,readFile } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';
import { assessOccupancy } from '../../src/lib/occupancy/evaluator.ts';
import { duplicateOccupancyPolicy,getOccupancyPolicy,getPublishedOccupancyPolicy,listOccupancyPolicies,publishOccupancyPolicy,upsertOccupancyRule } from '../../src/lib/occupancy/repository.ts';
import { OCCUPANCY_SUBJECTS } from '../../src/lib/occupancy/types.ts';

const {Pool}=pg;const databaseUrl=process.env.TEST_DATABASE_URL||process.env.DATABASE_URL;
const quote=(value:string)=>`"${value.replaceAll('"','""')}"`;
function scoped(base:string,schema:string){const url=new URL(base);url.searchParams.set('options',`-c search_path=${schema},public`);return url.toString()}

test('occupancy policies draft, model, publish, archive and remain immutable',async()=>{
  assert.ok(databaseUrl,'Set TEST_DATABASE_URL or DATABASE_URL to run the PostgreSQL integration test.');const schema=`occupancy_policy_${process.pid}_${crypto.randomBytes(5).toString('hex')}`;
  const control=new Pool({connectionString:databaseUrl,max:1});const db=new Pool({connectionString:scoped(databaseUrl!,schema),max:1});
  try{await control.query(`CREATE SCHEMA ${quote(schema)}`);const dir=new URL('../../db/',import.meta.url);for(const file of (await readdir(dir)).filter(name=>name.endsWith('.sql')).sort())await db.query(await readFile(new URL(file,dir),'utf8'));
    const admin=await db.query("INSERT INTO admin_users(email,display_name,password_hash) VALUES('occupancy@example.invalid','Occupancy Admin','x') RETURNING id");const adminId=String(admin.rows[0].id);
    const seeded=(await listOccupancyPolicies('main-house',db))[0];assert.equal(seeded.status,'draft');assert.equal(seeded.rules.length,0);
    for(const subject of OCCUPANCY_SUBJECTS)await upsertOccupancyRule({policyId:seeded.id,subject,maximumStandardCount:subject==='adults'?8:subject==='service_animals'?0:2,exceedOutcome:subject==='infants'||subject==='service_animals'?'host_decision_required':'bespoke',adminUserId:adminId},db);
    const complete=await getOccupancyPolicy(seeded.id,db);assert.equal(complete?.rules.length,5);assert.equal(assessOccupancy(complete!,{adults:9,children:0,infants:0,pets:0,serviceAnimals:0}).outcome,'bespoke');
    await publishOccupancyPolicy(seeded.id,adminId,db);assert.equal((await getPublishedOccupancyPolicy('main-house',db))?.id,seeded.id);
    await assert.rejects(upsertOccupancyRule({policyId:seeded.id,subject:'adults',maximumStandardCount:9,exceedOutcome:'bespoke',adminUserId:adminId},db),/DRAFT_POLICY_NOT_FOUND/);
    const replacement=await duplicateOccupancyPolicy(seeded.id,adminId,db);assert.equal(replacement.status,'draft');assert.equal(replacement.rules.length,5);
    await upsertOccupancyRule({policyId:replacement.id,subject:'adults',maximumStandardCount:10,exceedOutcome:'bespoke',adminUserId:adminId},db);await publishOccupancyPolicy(replacement.id,adminId,db);
    assert.equal((await getOccupancyPolicy(seeded.id,db))?.status,'archived');assert.equal((await getPublishedOccupancyPolicy('main-house',db))?.id,replacement.id);
    assert.equal(Number((await db.query("SELECT COUNT(*)::int AS count FROM occupancy_policy_events WHERE action IN ('published','archived')")).rows[0].count),3);
  }finally{await db.end();await control.query(`DROP SCHEMA IF EXISTS ${quote(schema)} CASCADE`);await control.end();}
});
