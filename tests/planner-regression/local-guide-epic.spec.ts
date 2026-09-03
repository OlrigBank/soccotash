import { expect, test } from '@playwright/test';
import pg from 'pg';
import type { Client as PgClient } from 'pg';
import { hashPassword } from '../../site/src/lib/admin/password.ts';

const {Client}=pg;
const EMAIL='playwright-local-guide-regression@example.test';
const BOOKER='Local Guide Regression Booker';
const TOKEN='localGuideRegressionToken012345678901234567';
const ADMIN_EMAIL='playwright-local-guide-admin@example.test';
const ADMIN_PASSWORD='playwright-local-guide-password';
const TITLE='Playwright Riverside Recommendation';
const UPDATED_TITLE='Playwright Riverside Walk Recommendation';
const ORIGINAL_SLUG='playwright-riverside-recommendation';
const RENAMED_SLUG='playwright-riverside-walk';
const ALL_PLACES_SLUG='local-guide-migration-all-places';

async function withDatabase<T>(run:(client:PgClient)=>Promise<T>):Promise<T>{
  const client=new Client({connectionString:process.env.DATABASE_URL});await client.connect();
  try{return await run(client)}finally{await client.end()}
}

async function removeGuideFixture(client:PgClient){
  const entry=await client.query(`SELECT id FROM local_guide_entries WHERE canonical_slug=ANY($1::text[])`,[[ORIGINAL_SLUG,RENAMED_SLUG]]);
  for(const {id} of entry.rows){
    await client.query(`DELETE FROM local_guide_slug_aliases WHERE local_guide_entry_id=$1`,[id]);
    await client.query(`DELETE FROM local_guide_events WHERE local_guide_entry_id=$1`,[id]);
    await client.query(`UPDATE local_guide_entries SET status='unpublished',working_revision_id=NULL,published_revision_id=NULL,published_at=NULL,unpublished_at=NOW() WHERE id=$1`,[id]);
    await client.query(`ALTER TABLE local_guide_revisions DISABLE TRIGGER local_guide_revisions_immutable`);
    try{await client.query(`DELETE FROM local_guide_revisions WHERE local_guide_entry_id=$1`,[id]);}
    finally{await client.query(`ALTER TABLE local_guide_revisions ENABLE TRIGGER local_guide_revisions_immutable`);}
    await client.query(`DELETE FROM local_guide_entries WHERE id=$1`,[id]);
  }
}

async function cleanFixture(){await withDatabase(async client=>{
  await client.query('BEGIN');try{
    await client.query(`DELETE FROM holiday_plans WHERE booking_id IN(SELECT id FROM provisional_bookings WHERE guest_email=$1)`,[EMAIL]);
    await client.query(`DELETE FROM provisional_bookings WHERE guest_email=$1`,[EMAIL]);
    await removeGuideFixture(client);
    await client.query(`DELETE FROM admin_sessions WHERE admin_user_id IN(SELECT id FROM admin_users WHERE email=$1)`,[ADMIN_EMAIL]);
    await client.query(`DELETE FROM admin_users WHERE email=$1`,[ADMIN_EMAIL]);
    await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error}
})}

async function ensureAllPlacesPlanFixture():Promise<string|null>{return withDatabase(async client=>{
  const existing=await client.query(`SELECT id::text FROM holiday_plans WHERE public_slug=$1`,[ALL_PLACES_SLUG]);
  if(existing.rowCount)return null;
  await client.query('BEGIN');try{
    const entries=await client.query(`SELECT e.id,r.title,r.summary
      FROM local_guide_entries e JOIN local_guide_revisions r ON r.id=e.published_revision_id
      WHERE e.legacy_content_id IS NOT NULL AND e.status='published' ORDER BY e.canonical_slug`);
    if(entries.rowCount!==39)throw new Error(`The all-places fixture requires 39 published migrated entries; found ${entries.rowCount}.`);
    const plan=await client.query(`INSERT INTO holiday_plans
      (plan_type,title,description,publication_status,visibility,duration_days,public_slug)
      VALUES('example','Local Guide Migration — All Places',
        'Playwright fixture containing every migrated Local Guide entry.','published','public',1,$1)
      RETURNING id::text`,[ALL_PLACES_SLUG]);
    const day=await client.query(`INSERT INTO plan_days(holiday_plan_id,title,summary,position)
      VALUES($1,'All migrated Local Guide places',
        'One planner item for every Local Guide entry captured by the database migration.',10)
      RETURNING id`,[plan.rows[0].id]);
    for(const [index,entry] of entries.rows.entries())await client.query(`INSERT INTO plan_items
      (plan_day_id,title,description,item_type,status,position,visibility,local_guide_entry_id)
      VALUES($1,$2,$3,'activity','idea',$4,'participants',$5)`,
      [day.rows[0].id,entry.title,entry.summary,(index+1)*10,entry.id]);
    await client.query('COMMIT');return plan.rows[0].id;
  }catch(error){await client.query('ROLLBACK');throw error}
})}

async function removeAllPlacesPlanFixture(id:string|null):Promise<void>{
  if(!id)return;
  await withDatabase(client=>client.query(`DELETE FROM holiday_plans WHERE id=$1 AND public_slug=$2`,[id,ALL_PLACES_SLUG]));
}

test.describe('Local Guide database migration epic',()=>{
  test.afterEach(async()=>{await cleanFixture()});

  test('serves every migrated entry and the complete stable-ID example plan',async({request})=>{
    const fixturePlanId=await ensureAllPlacesPlanFixture();
    try{
      const state=await withDatabase(async client=>{
        const entries=await client.query(`SELECT public_id::text,canonical_slug FROM local_guide_entries WHERE legacy_content_id IS NOT NULL ORDER BY canonical_slug`);
        const plan=await client.query(`SELECT p.public_slug,count(i.id)::int AS item_count,count(i.local_guide_entry_id)::int AS guide_count
          FROM holiday_plans p JOIN plan_days d ON d.holiday_plan_id=p.id JOIN plan_items i ON i.plan_day_id=d.id
          WHERE p.public_slug=$1 AND p.publication_status='published' GROUP BY p.id`,[ALL_PLACES_SLUG]);
        const retired=await client.query(`SELECT table_name,column_name FROM information_schema.columns WHERE table_schema=current_schema()
          AND ((table_name='plan_items' AND column_name='local_guide_slug') OR (table_name='local_guide_entries' AND column_name='migration_source_sha256'))`);
        return {entries:entries.rows,plan:plan.rows[0],retired:retired.rows};
      });
      expect(state.entries).toHaveLength(39);
      expect(state.retired).toEqual([]);
      expect(state.plan).toEqual({public_slug:ALL_PLACES_SLUG,item_count:39,guide_count:39});
      for(const entry of state.entries)expect((await request.get(`/local-guide/${entry.canonical_slug}/`)).status()).toBe(200);
      const plan=await request.get(`/holiday-plans/${ALL_PLACES_SLUG}/`);expect(plan.status()).toBe(200);
      expect(await plan.text()).toContain('Local Guide');
    }finally{await removeAllPlacesPlanFixture(fixturePlanId)}
  });

  test('moves a consented contribution through editorial publication while retaining its planner reference',async({browser,page,request})=>{
    await cleanFixture();const passwordHash=await hashPassword(ADMIN_PASSWORD);
    await withDatabase(async client=>{
      await client.query(`INSERT INTO admin_users(email,display_name,password_hash) VALUES($1,'Playwright Local Guide Admin',$2)`,[ADMIN_EMAIL,passwordHash]);
      await client.query(`INSERT INTO provisional_bookings(property_id,arrival,departure,guests,guest_name,guest_email,status,customer_access_token)
        VALUES('olrig-bank','2099-10-10','2099-10-14',2,$1,$2,'confirmed',$3)`,[BOOKER,EMAIL,TOKEN]);
    });

    await page.goto(`/booking/manage/${TOKEN}/`);await page.getByRole('link',{name:/Holiday Planner/}).click();
    await expect(page.getByRole('heading',{name:'Planning dashboard'})).toBeVisible();
    await page.getByRole('button',{name:'Create my holiday plan'}).click();
    await page.getByRole('link',{name:'Open plan'}).click();
    await page.getByRole('button',{name:'Add my own activity'}).click();
    const candidateDialog=page.locator('[data-candidate-dialog]');
    await candidateDialog.getByLabel('Title').fill(TITLE);
    await candidateDialog.getByLabel('Webpage URL').fill('https://example.test/riverside');
    await candidateDialog.getByLabel('Description').fill('A quiet route beside the River Kent.');
    await candidateDialog.getByRole('button',{name:'Add to candidates'}).click();
    const candidate=page.locator('[data-candidate-id]').filter({hasText:TITLE});
    await candidate.locator(`summary[aria-label="Actions for ${TITLE}"]`).click();
    await candidate.getByRole('button',{name:'Add to selected day'}).click();

    const adminContext=await browser.newContext();const admin=await adminContext.newPage();
    await admin.goto('/admin/login/');await admin.getByLabel('Email address').fill(ADMIN_EMAIL);
    await admin.getByLabel('Password').fill(ADMIN_PASSWORD);await admin.getByRole('button',{name:'Sign in'}).click();
    await admin.goto('/admin/local-guide/');await admin.getByRole('button',{name:'Create entry'}).click();
    await admin.getByLabel('Title',{exact:true}).fill("Café & Cycle Sprog's Family Rides");
    await expect(admin.getByLabel('Public URL slug')).toHaveValue('cafe-cycle-sprogs-family-rides');
    await admin.getByLabel('Public URL slug').fill('chosen-family-rides');
    await admin.getByLabel('Title',{exact:true}).fill('A completely different title');await expect(admin.getByLabel('Public URL slug')).toHaveValue('chosen-family-rides');
    await admin.getByRole('button',{name:'Close'}).click();
    await admin.goto('/admin/planner/contributions/');const review=admin.locator('.contribution-review').filter({hasText:TITLE});
    await review.getByLabel('Local Guide slug').fill(ORIGINAL_SLUG);
    await review.getByLabel('Category for new entry').selectOption('activities');
    await review.getByLabel('Reviewed summary').fill('');
    await review.getByRole('button',{name:'Accept into private editorial workflow'}).click();
    const decision=admin.getByRole('row').filter({hasText:TITLE});await expect(decision).toContainText('new entry draft');
    await decision.getByRole('link',{name:'Open result'}).click();await expect(admin.getByText('draft').first()).toBeVisible();
    await expect(admin.locator('[data-local-guide-preview] h3')).toHaveText(TITLE);
    await expect(admin.getByText('No additional body content.')).toBeVisible();
    expect((await request.get(`/local-guide/${ORIGINAL_SLUG}/`)).status()).toBe(404);

    const confirmedAction=async(name:string)=>{admin.once('dialog',dialog=>dialog.accept());const response=admin.waitForResponse(value=>value.url().endsWith('/api/admin/local-guide/action/')&&value.request().method()==='POST');const navigation=admin.waitForNavigation({waitUntil:'load'});await admin.getByRole('button',{name}).click();expect((await response).status()).toBe(200);await navigation};
    await confirmedAction('Publish working revision');
    await expect(admin.getByText('published').first()).toBeVisible();
    expect((await request.get(`/local-guide/${ORIGINAL_SLUG}/`)).status()).toBe(200);

    await admin.getByLabel('Title').fill(UPDATED_TITLE);await admin.getByLabel('Markdown body').fill('## Riverside route\n\nA database-backed recommendation from a guest.');
    await admin.getByRole('button',{name:'Save new revision'}).click();await expect(admin.getByText(/Revision 3:/).first()).toBeVisible();
    await expect(admin.getByText(/working revision contains unpublished changes/)).toBeVisible();
    await expect(admin.locator('[data-local-guide-preview] h3')).toHaveText(UPDATED_TITLE);
    await expect(admin.getByRole('button',{name:'Publish working revision'})).toBeVisible();
    await expect(admin.getByRole('button',{name:'Unpublish current entry'})).toBeVisible();
    expect(await (await request.get(`/local-guide/${ORIGINAL_SLUG}/`)).text()).toContain(TITLE);
    await confirmedAction('Publish working revision');
    expect(await (await request.get(`/local-guide/${ORIGINAL_SLUG}/`)).text()).toContain(UPDATED_TITLE);
    const guideIdentity=await withDatabase(async client=>(await client.query(`SELECT id::text,public_id::text FROM local_guide_entries WHERE canonical_slug=$1`,[ORIGINAL_SLUG])).rows[0]);

    await page.reload();await page.getByRole('button',{name:TITLE}).click();
    const activityDialog=page.locator('[data-item-dialog]');await activityDialog.getByLabel('Olrig Bank Local Guide').selectOption(guideIdentity.public_id);
    const guideResponse=page.waitForResponse(response=>response.url().includes(`/api/booking/planner/${TOKEN}/`)&&response.request().method()==='POST');
    await activityDialog.getByRole('button',{name:'Apply guide reference'}).click();expect((await guideResponse).status()).toBe(200);
    await expect(page.getByRole('link',{name:`Open the Local Guide entry for ${TITLE} in a new tab`})).toHaveAttribute('href',`/local-guide/${ORIGINAL_SLUG}/`);
    const stableId=await withDatabase(async client=>(await client.query(`SELECT i.local_guide_entry_id::text FROM plan_items i JOIN plan_days d ON d.id=i.plan_day_id JOIN holiday_plans p ON p.id=d.holiday_plan_id JOIN provisional_bookings b ON b.id=p.booking_id WHERE b.guest_email=$1 AND i.title=$2`,[EMAIL,TITLE])).rows[0].local_guide_entry_id);
    expect(stableId).toBe(guideIdentity.id);

    await admin.locator('summary',{hasText:'Advanced URL settings'}).click();await admin.getByLabel('Public URL slug').fill(RENAMED_SLUG);
    await confirmedAction('Change public URL');await expect(admin.getByText(RENAMED_SLUG,{exact:true})).toBeVisible();
    const alias=await request.get(`/local-guide/${ORIGINAL_SLUG}/`,{maxRedirects:0});expect(alias.status()).toBe(301);
    expect(alias.headers().location).toBe(`/local-guide/${RENAMED_SLUG}/`);
    await page.reload();await expect(page.getByRole('link',{name:`Open the Local Guide entry for ${TITLE} in a new tab`})).toHaveAttribute('href',`/local-guide/${RENAMED_SLUG}/`);

    await confirmedAction('Unpublish current entry');
    await expect(admin.getByText('unpublished').first()).toBeVisible();
    expect((await request.get(`/local-guide/${RENAMED_SLUG}/`)).status()).toBe(404);
    const evidence=await withDatabase(async client=>(await client.query(`SELECT e.status,e.id::text=$2 AS stable_reference,
      EXISTS(SELECT 1 FROM local_guide_slug_aliases a WHERE a.local_guide_entry_id=e.id AND a.old_slug=$3) AS alias_retained,
      EXISTS(SELECT 1 FROM local_guide_revisions r WHERE r.local_guide_entry_id=e.id AND r.actor_type='contribution' AND r.source='planner_contribution') AS contribution_provenance
      FROM local_guide_entries e WHERE e.canonical_slug=$1`,[RENAMED_SLUG,stableId,ORIGINAL_SLUG])).rows[0]);
    expect(evidence).toEqual({status:'unpublished',stable_reference:true,alias_retained:true,contribution_provenance:true});
    await adminContext.close();
  });
});
