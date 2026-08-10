import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readdir,readFile } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';
import { createLocalGuideDraft,listPublishedLocalGuideEntries } from '../../src/lib/local-guide/repository.ts';
import { deleteLocalGuideCategory,getLocalGuideWorkspace,listPublishedLocalGuideCategories,
  listWorkingLocalGuideCategories,publishLocalGuideWorkspace,saveLocalGuideCategory } from '../../src/lib/local-guide/workspace.ts';
import { LocalGuideError } from '../../src/lib/local-guide/types.ts';

const{Pool}=pg;const databaseUrl=process.env.TEST_DATABASE_URL||process.env.DATABASE_URL;
const quote=(value:string)=>`"${value.replaceAll('"','""')}"`;
const scoped=(base:string,schema:string)=>{const url=new URL(base);url.searchParams.set('options',`-c search_path=${schema},public`);return url.toString()};

test('maintains and atomically publishes a database-backed Local Guide draft',async()=>{
 assert.ok(databaseUrl,'Set TEST_DATABASE_URL or DATABASE_URL.');const schema=`guide_workspace_${process.pid}_${crypto.randomBytes(5).toString('hex')}`;const control=new Pool({connectionString:databaseUrl,max:1});const database=new Pool({connectionString:scoped(databaseUrl,schema),max:3});
 try{await control.query(`CREATE SCHEMA ${quote(schema)}`);const directory=new URL('../../db/',import.meta.url);for(const file of(await readdir(directory)).filter(name=>name.endsWith('.sql')).sort())await database.query(await readFile(new URL(file,directory),'utf8'));
  const admin=await database.query(`INSERT INTO admin_users(email,display_name,password_hash)VALUES('workspace@example.invalid','Workspace Admin','unused')RETURNING id::text`);const actor={type:'administrator' as const,adminUserId:admin.rows[0].id,source:'integration_test'};
  assert.equal((await getLocalGuideWorkspace(database)).lockVersion,1);
  assert.equal(await saveLocalGuideCategory({id:'day-trips',label:'Day trips',description:'Ideas for a full day.',parentId:'home',expectedWorkspaceVersion:1,actor},database),2);
  const draft=await createLocalGuideDraft({slug:'test-day-trip',content:{title:'Test day trip',summary:'A draft suggestion.',markdownBody:'Details.',categoryId:'day-trips',imagePath:'https://images.example.invalid/day-trip.jpg',externalLink:'https://example.invalid/day-trip'},actor},database);
  assert.equal((await getLocalGuideWorkspace(database)).lockVersion,3);
  await assert.rejects(deleteLocalGuideCategory({id:'day-trips',expectedWorkspaceVersion:3,actor},database),(error:unknown)=>error instanceof LocalGuideError&&/no entries/.test(error.message));
  assert.equal((await listPublishedLocalGuideCategories(database)).some(category=>category.id==='day-trips'),false);
  assert.equal((await listPublishedLocalGuideEntries(database)).some(entry=>entry.id===draft.id),false);
  assert.equal(await publishLocalGuideWorkspace({expectedWorkspaceVersion:3,acknowledgeWarnings:false,actor},database),2);
  assert.equal((await listPublishedLocalGuideCategories(database)).find(category=>category.id==='day-trips')?.label,'Day trips');
  assert.equal((await listPublishedLocalGuideEntries(database)).find(entry=>entry.id===draft.id)?.title,'Test day trip');
  assert.equal(await saveLocalGuideCategory({id:'day-trips',label:'Days out',description:'Revised draft label.',parentId:'home',expectedWorkspaceVersion:3,actor},database),4);
  assert.equal((await listWorkingLocalGuideCategories(database)).find(category=>category.id==='day-trips')?.label,'Days out');
  assert.equal((await listPublishedLocalGuideCategories(database)).find(category=>category.id==='day-trips')?.label,'Day trips');
  assert.equal(await saveLocalGuideCategory({id:'empty-category',label:'Empty category',parentId:'home',expectedWorkspaceVersion:4,actor},database),5);
  assert.equal(await deleteLocalGuideCategory({id:'empty-category',expectedWorkspaceVersion:5,actor},database),6);
  assert.equal((await listWorkingLocalGuideCategories(database)).some(category=>category.id==='empty-category'),false);
 }finally{await database.end();await control.query(`DROP SCHEMA IF EXISTS ${quote(schema)} CASCADE`);await control.end()}
});
