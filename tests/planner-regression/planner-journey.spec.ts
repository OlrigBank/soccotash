import { expect, test } from '@playwright/test';
import pg from 'pg';
import type { Client as PgClient } from 'pg';

const {Client}=pg;
const EMAIL='playwright-planner-regression@example.test';
const BOOKER='Playwright Planner Booker';
const TOKEN='plannerRegressionToken012345678901234567890';

async function withDatabase<T>(run:(client:PgClient)=>Promise<T>):Promise<T>{
  const client=new Client({connectionString:process.env.DATABASE_URL});await client.connect();
  try{return await run(client)}finally{await client.end()}
}

async function cleanFixture(){await withDatabase(async client=>{
  await client.query('BEGIN');try{
    await client.query(`DELETE FROM holiday_plans WHERE booking_id IN(SELECT id FROM provisional_bookings WHERE guest_email=$1)`,[EMAIL]);
    await client.query(`DELETE FROM provisional_bookings WHERE guest_email=$1`,[EMAIL]);
    await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error}
})}

test.describe('local Docker Holiday Planner regression',()=>{
  test.beforeEach(async()=>{await cleanFixture();await withDatabase(async client=>{
    await client.query(`INSERT INTO provisional_bookings(property_id,arrival,departure,guests,guest_name,guest_email,status,customer_access_token)
      VALUES('olrig-bank','2099-09-10','2099-09-14',2,$1,$2,'confirmed',$3)`,[BOOKER,EMAIL,TOKEN]);
  })});
  test.afterEach(async()=>{await cleanFixture()});

  test('creates, shares and safely applies an external AI proposal',async({browser,page})=>{
    await page.goto(`/booking/manage/${TOKEN}/`);
    await page.getByRole('link',{name:/Holiday Planner/}).click();
    await expect(page.getByRole('heading',{name:'Planning dashboard'})).toBeVisible();
    await page.getByRole('button',{name:'Create my holiday plan'}).click();
    await expect(page.getByRole('status')).toContainText('private holiday plan has been created');
    await page.getByRole('link',{name:'Open plan'}).click();
    await expect(page.getByRole('heading',{level:1,name:'Holiday Planner'})).toBeVisible();
    await expect(page.getByRole('heading',{name:'Day 1'})).toBeVisible();
    await page.getByRole('button',{name:'Add my own activity'}).click();
    const candidateDialog=page.locator('[data-candidate-dialog]');
    await candidateDialog.getByLabel('Title').fill('Walk to Kendal Castle');
    await candidateDialog.getByLabel('Webpage URL').fill('https://example.test/kendal-castle');
    await candidateDialog.getByLabel('Description').fill('Take the quiet riverside route.');
    await candidateDialog.getByLabel(/Do not save this activity/).check();
    await candidateDialog.getByRole('button',{name:'Add to candidates'}).click();
    const candidate=page.locator('[data-candidate-id]').filter({hasText:'Walk to Kendal Castle'});
    await candidate.locator('summary[aria-label="Actions for Walk to Kendal Castle"]').click();
    await candidate.getByRole('button',{name:'Add to selected day'}).click();
    await expect(page.getByRole('button',{name:/Walk to Kendal Castle/})).toBeVisible();

    const inviteForm=page.locator('#invite-participant-form');
    await inviteForm.getByLabel('Name').fill('Planner Editor');
    await inviteForm.getByLabel('Email').fill('planner-editor@example.test');
    await inviteForm.getByLabel('Role').selectOption('editor');
    await inviteForm.getByRole('button',{name:'Create invitation'}).click();
    const invitationField=page.locator('[data-invitation-link]');await expect(invitationField).toHaveValue(/^http:\/\//);
    const invitationUrl=await invitationField.inputValue();
    const editorContext=await browser.newContext();const editorPage=await editorContext.newPage();
    await editorPage.goto(invitationUrl);await expect(editorPage.getByText('Shared Holiday Planner · editor')).toBeVisible();
    await editorContext.close();

    await page.locator('#create-share-form').getByRole('button',{name:'Create share link'}).click();
    const shareField=page.locator('[data-share-link]');await expect(shareField).toHaveValue(/^http:\/\//);
    const shareUrl=await shareField.inputValue();
    const sharePage=await browser.newPage();await sharePage.goto(shareUrl);
    await expect(sharePage.getByText('Walk to Kendal Castle')).toBeVisible();
    await expect(sharePage.locator('body')).not.toContainText('Planner Editor');await sharePage.close();

    await page.locator('#create-ai-capability-form').getByRole('button',{name:'Create AI collaboration link'}).click();
    const aiField=page.locator('[data-ai-capability-link]');await expect(aiField).toHaveValue(/^http:\/\//);
    const aiUrl=await aiField.inputValue();
    const aiPage=await browser.newPage();await aiPage.goto(aiUrl);
    await expect(aiPage.getByRole('heading',{name:'Help develop this holiday plan'})).toBeVisible();
    const planRepresentation=await aiPage.evaluate(async()=>await (await fetch(`${location.pathname.replace(/\/$/,'')}/plan.json`)).json());
    expect(planRepresentation.trip.title).toBe(`${BOOKER}'s holiday plan`);
    expect(JSON.stringify(planRepresentation)).not.toContain(EMAIL);
    const planId=planRepresentation.planId;const dayId=planRepresentation.days[0].id;
    const proposal={format:'olrig-holiday-plan-proposal',version:'1.0',planId,sourceRevision:planRepresentation.revision,
      summary:'Add a market visit',operations:[{op:'add_item',dayId,afterItemId:null,item:{title:'Kendal market',type:'activity',
        description:'Browse local produce.',startTime:'10:00',endTime:'11:00',location:'Kendal',status:'proposed'}}]};
    const submission=await aiPage.evaluate(async body=>{const response=await fetch(`${location.pathname.replace(/\/$/,'')}/proposals/`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const text=await response.text();return{status:response.status,body:JSON.parse(text)}},proposal);
    expect(submission.status).toBe(202);await aiPage.close();

    await page.reload();
    await page.getByRole('link',{name:'Add a market visit'}).click();
    await expect(page.getByRole('heading',{name:'Add a market visit'})).toBeVisible();
    await page.getByRole('button',{name:'Apply selected operations'}).click();
    await expect(page.getByText('Proposal accepted.')).toBeVisible();
    await page.getByRole('link',{name:'Back to planner'}).click();
    await expect(page.getByRole('button',{name:/Kendal market/})).toBeVisible();

    const evidence=await withDatabase(async client=>(await client.query(`SELECT p.status,r.actor_type,r.source,
      p.decided_by_participant_id IS NOT NULL AS attributed FROM plan_ai_proposals p JOIN holiday_plans hp ON hp.id=p.holiday_plan_id
      JOIN provisional_bookings pb ON pb.id=hp.booking_id JOIN plan_revisions r ON r.holiday_plan_id=hp.id AND r.action='ai_proposal_accepted'
      WHERE pb.guest_email=$1`,[EMAIL])).rows[0]);
    expect(evidence).toEqual({status:'accepted',actor_type:'external_ai',source:'external_ai_proposal',attributed:true});
  });
});
