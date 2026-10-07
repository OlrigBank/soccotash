import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readdir,readFile } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';
import { createLocalGuideDraft,editLocalGuideDraft,listLocalGuideEntries,listPublishedLocalGuideEntries } from '../../src/lib/local-guide/repository.ts';
import { checkAllLocalGuideUrls,deleteLocalGuideCategory,getLocalGuideWorkspace,listPublishedLocalGuideCategories,
  listWorkingLocalGuideCategories,moveLocalGuideCategory,publishLocalGuideWorkspace,saveLocalGuideCategory } from '../../src/lib/local-guide/workspace.ts';
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
  const oldCategories = await listPublishedLocalGuideCategories(database);
  assert.equal(await moveLocalGuideCategory({id:'outdoor-pursuits',direction:'up',expectedWorkspaceVersion:6,actor},database),7);
  assert.deepEqual(await listPublishedLocalGuideCategories(database),oldCategories,'draft reordering must not change the public guide');
  assert.equal(await publishLocalGuideWorkspace({expectedWorkspaceVersion:7,acknowledgeWarnings:false,actor},database),3);
  const reordered = await listPublishedLocalGuideCategories(database);
  assert.equal(reordered.find(category=>category.id==='outdoor-pursuits')?.position,10);
  assert.equal(reordered.find(category=>category.id==='whats-on')?.position,20);
  assert.equal(await moveLocalGuideCategory({id:'outdoor-pursuits',direction:'down',expectedWorkspaceVersion:7,actor},database),8);
  const publications = await database.query('SELECT count(*)::int count FROM local_guide_publications');
  const failingDatabase = {
   query: database.query.bind(database),
   connect: async () => {
    const client = await database.connect();
    const originalQuery = client.query;
    client.query = (async (...args: any[]) => {
     if (String(args[0]).startsWith('UPDATE local_guide_entries SET status=')) throw new Error('simulated publication failure');
     return (originalQuery as any).apply(client,args);
    }) as typeof client.query;
    const originalRelease = client.release.bind(client);
    client.release = () => { client.query = originalQuery; originalRelease(); };
    return client;
   },
  };
  await assert.rejects(publishLocalGuideWorkspace({expectedWorkspaceVersion:8,acknowledgeWarnings:false,actor},failingDatabase),/simulated publication failure/);
  assert.deepEqual(await listPublishedLocalGuideCategories(database),reordered,'failed publication must restore published categories');
  assert.equal((await getLocalGuideWorkspace(database)).publishedVersion,3);
  assert.deepEqual((await database.query('SELECT count(*)::int count FROM local_guide_publications')).rows,publications.rows);
  assert.equal(await publishLocalGuideWorkspace({expectedWorkspaceVersion:8,acknowledgeWarnings:false,actor},database),4);
  assert.deepEqual(await listPublishedLocalGuideCategories(database),oldCategories.map(category=>category.id==='day-trips'?{...category,label:'Days out',description:'Revised draft label.'}:category));
  assert.equal(await saveLocalGuideCategory({id:'published-empty',label:'Empty',parentId:'home',expectedWorkspaceVersion:8,actor},database),9);
  assert.equal(await publishLocalGuideWorkspace({expectedWorkspaceVersion:9,acknowledgeWarnings:false,actor},database),5);
  const freedPosition=(await listPublishedLocalGuideCategories(database)).find(category=>category.id==='published-empty')!.position;
  assert.equal(await deleteLocalGuideCategory({id:'published-empty',expectedWorkspaceVersion:9,actor},database),10);
  assert.equal(await saveLocalGuideCategory({id:'replacement',label:'Replacement',parentId:'home',expectedWorkspaceVersion:10,actor},database),11);
  assert.equal(await publishLocalGuideWorkspace({expectedWorkspaceVersion:11,acknowledgeWarnings:false,actor},database),6);
  const replaced=await listPublishedLocalGuideCategories(database);
  assert.equal(replaced.some(category=>category.id==='published-empty'),false);
  assert.equal(replaced.find(category=>category.id==='replacement')?.position,freedPosition);
  const ruskins=(await listLocalGuideEntries(database)).find(entry=>entry.slug==='ruskins')!;
  assert.ok(ruskins.workingRevision?.imagePath?.startsWith('/media/images/'));
  const edited=await editLocalGuideDraft({entryId:ruskins.id,expectedVersion:ruskins.lockVersion,content:{...ruskins.workingRevision!,summary:'Edited while retaining the bundled image.'},actor},database);
  assert.equal(edited.workingRevision?.imagePath,ruskins.workingRevision?.imagePath);
  assert.equal(await publishLocalGuideWorkspace({expectedWorkspaceVersion:12,acknowledgeWarnings:false,actor},database),7);
  assert.equal((await listPublishedLocalGuideEntries(database)).find(entry=>entry.id===ruskins.id)?.summary,'Edited while retaining the bundled image.');
  const imageOnlyDatabase={connect:database.connect.bind(database),query:(async(text:string,...args:any[])=>{
    if(text.startsWith('SELECT e.id,e.public_id::text entry_id')) return database.query(text+" AND e.canonical_slug='ruskins'").then(result=>({...result,rows:result.rows.map(row=>({...row,external_link:null}))}));
    return (database.query as any)(text,...args);
  }) as typeof database.query};
  assert.deepEqual(await checkAllLocalGuideUrls({actor},imageOnlyDatabase),{checked:1,passed:1,warnings:0});




 }finally{await database.end();await control.query(`DROP SCHEMA IF EXISTS ${quote(schema)} CASCADE`);await control.end()}
});
