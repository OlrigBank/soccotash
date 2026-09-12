import { test, expect } from '@playwright/test';
import pg from 'pg';
import { randomUUID, randomBytes, createHash } from 'node:crypto';

test('verify, submit, return, select bookings and log out', async ({ page, context, request, baseURL }) => {
  const email = `e11-${randomUUID()}@example.test`, name = `E11 account ${randomUUID()}`;
  const db = new pg.Client(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : { host:'127.0.0.1',port:5433,user:process.env.POSTGRES_USER || 'soccotash',password:process.env.POSTGRES_PASSWORD,database:process.env.POSTGRES_DB || 'soccotash' });
  await db.connect();const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  let accountId='';
  try {
    await page.goto('/book/?propertyId=bespoke-arrangement&arrival=2099-10-19&departure=2099-10-23&adults=2&children=0&infants=0&pets=0');
    await page.getByRole('link',{name:'Start a bespoke request'}).click();
    await expect(page.getByRole('button',{name:'Continue to review'})).toBeDisabled();
    await page.getByLabel('Booker name').fill(name);
    await page.getByLabel('Booker email').fill(email);
    await page.getByLabel('Mobile number',{exact:true}).focus();
    await expect(page.locator('[data-code-entry]')).toBeHidden();
    await page.getByLabel('Message to Olrig Bank (optional)').focus();
    await expect(page.locator('[data-code-entry]')).toBeVisible();
    let code='';await expect.poll(async()=>{const data=await (await request.get(`http://127.0.0.1:1027/?recipient=${encodeURIComponent(email)}`)).json();code=data.code;return Boolean(code);}).toBe(true);
    await page.getByLabel('Verification code',{exact:true}).fill(code === '000000' ? '111111' : '000000');
    await page.getByRole('button',{name:'Verify code',exact:true}).click();
    await expect(page.locator('[data-verification-status]')).toContainText('invalid');
    await expect(page.getByRole('button',{name:'Continue to review'})).toBeDisabled();
    await page.getByLabel('Verification code',{exact:true}).fill(code);
    await page.getByLabel('Verification code',{exact:true}).press('Enter');
    await expect(page.locator('[data-verification-status]')).toContainText('Contact verified');
    await expect(page.getByRole('button',{name:'Continue to review'})).toBeFocused();
    await page.getByLabel('Mobile number',{exact:true}).fill('+447700900111');
    await expect(page.locator('[data-booker-verification]')).toHaveAttribute('data-verified','true');
    await page.getByRole('button',{name:'Continue to review'}).click();
    await expect(page.locator('[data-booking-review]')).toBeVisible();
    await page.getByRole('button',{name:'Request booking',exact:true}).click();
    await expect(page).toHaveURL(/\/booking\/manage\/[0-9a-f-]{36}\/$/);
    const privatePath=new URL(page.url()).pathname;
    const booking=(await db.query('SELECT id,public_id::text,booker_account_id FROM provisional_bookings WHERE guest_name=$1',[name])).rows[0];
    accountId=booking.booker_account_id;expect(accountId).toBeTruthy();
    const session=(await context.cookies()).find(cookie=>cookie.name==='olrig_booker_session')!;
    expect(session.httpOnly).toBe(true);expect(session.sameSite).toBe('Lax');expect(session.value.length).toBe(43);
    expect((await db.query('SELECT account_id FROM booker_sessions WHERE token_hash=$1',[createHash('sha256').update(session.value).digest('hex')])).rows[0].account_id).toBe(accountId);
    expect((await db.query('SELECT identifier FROM booker_identities WHERE account_id=$1',[accountId])).rows).toEqual([{identifier:email}]);
    await page.reload();await page.locator('summary[aria-label="Booking account"]').click();await expect(page.getByRole('button',{name:'Log out'})).toBeVisible();
    await page.getByRole('link',{name:'Your bookings',exact:true}).click();await expect(page.locator('.booking-selector li')).toHaveCount(1);
    await page.goto('/');await page.getByRole('link',{name:'Your bookings',exact:true}).click();await expect(page).toHaveURL(privatePath);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth)).toBe(false);
    await db.query(`INSERT INTO provisional_bookings(property_id,arrival,departure,guests,guest_name,guest_email,booker_account_id)
      VALUES('bespoke-arrangement','2099-11-19','2099-11-23',2,$1,$2,$3)`,[name,email,accountId]);
    await page.goto('/booking/');await expect(page.locator('.booking-selector li')).toHaveCount(2);
    await page.locator('summary[aria-label="Booking account"]').click();await page.getByRole('button',{name:'Log out'}).click();await expect(page.getByRole('form',{name:'Booker sign-in'})).toBeVisible();
    await page.goto(privatePath);await expect(page).toHaveURL(/\/booking\/\?returnTo=/);
    await db.query("UPDATE booker_verification_requests SET created_at=NOW()-INTERVAL '2 minutes' WHERE destination_hash=$1",[createHash('sha256').update(`email:${email}`).digest('hex')]);
    await page.getByLabel('Email address',{exact:true}).fill(email);await page.getByLabel('Mobile number',{exact:true}).focus();await page.getByRole('heading',{name:'Your bookings',exact:true}).click();
    await expect(page.locator('[data-code-entry]')).toBeVisible();
    const loginCode=(await (await request.get(`http://127.0.0.1:1027/?recipient=${encodeURIComponent(email)}`)).json()).code;
    await page.getByLabel('Verification code',{exact:true}).fill(loginCode);await page.getByRole('button',{name:'Verify code',exact:true}).click();
    await expect(page).toHaveURL(privatePath);
    const csrf=await page.request.post(`/api/booking/planner/${booking.public_id}/`,{headers:{origin:'https://foreign.example'},data:{}});expect(csrf.status()).toBe(403);
    const old=await page.request.get(`/booking/manage/${randomBytes(32).toString('base64url')}/`,{maxRedirects:0});expect(old.status()).toBe(303);
    await page.goto('/book/?propertyId=bespoke-arrangement&arrival=2099-10-19&departure=2099-10-23&adults=2');await page.getByRole('link',{name:'Start a bespoke request'}).click();
    await page.getByLabel('Booker email').fill(email);await expect(page.locator('[data-booker-verification]')).toHaveAttribute('data-verified','true');
    const otherAccount=(await db.query('INSERT INTO booker_accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    const otherContext=await context.browser()!.newContext();
    try {
      const otherToken=randomBytes(32).toString('base64url');
      await db.query("INSERT INTO booker_sessions(token_hash,account_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '1 hour')",[createHash('sha256').update(otherToken).digest('hex'),otherAccount]);
      await otherContext.addCookies([{name:'olrig_booker_session',value:otherToken,url:baseURL!,httpOnly:true,sameSite:'Lax'}]);
      for(const suffix of ['', 'reservation/', 'messages/', 'holiday-planner/', 'planner/', 'planner/print/', 'planner/proposals/unavailable/']) {
        const denied=await otherContext.request.get(new URL(privatePath+suffix,baseURL).href);
        expect(denied.status()).toBe(404);expect(await denied.text()).not.toContain(name);
      }
      expect((await otherContext.request.get(`${baseURL}/api/booking/messages/${booking.public_id}/`)).status()).toBe(404);
      expect((await otherContext.request.post(`${baseURL}/api/booking/planner/${booking.public_id}/`,{headers:{origin:baseURL!},data:{}})).status()).toBe(404);
      const empty=await otherContext.newPage();await empty.goto(`${baseURL}/booking/`);
      await expect(empty.getByText('There are no accessible bookings linked to this account.')).toBeVisible();
    } finally { await otherContext.close();await db.query('DELETE FROM booker_accounts WHERE id=$1',[otherAccount]); }
    expect(errors).toEqual([]);
  } finally {
    await db.query('DELETE FROM provisional_bookings WHERE guest_name=$1',[name]);
    if(accountId){await db.query('DELETE FROM booker_identities WHERE account_id=$1',[accountId]);await db.query('DELETE FROM booker_accounts WHERE id=$1',[accountId]);}
    await db.query('DELETE FROM booker_challenges WHERE identifier=$1',[email]);await db.query('DELETE FROM booker_verification_grants WHERE identifier=$1',[email]);
    await db.query('DELETE FROM booker_verification_requests WHERE destination_hash=$1',[createHash('sha256').update(`email:${email}`).digest('hex')]);
    await db.end();
  }
});

test('SMS selection, failed delivery, stale response and expired verification remain recoverable',async({page})=>{
  await page.route('**/api/booker/session/**',route=>route.fulfill({json:{identities:[],grants:[]}}));
  let release:()=>void=()=>{};const gate=new Promise<void>(resolve=>release=resolve);
  await page.route('**/api/booker/request-code/**',async route=>{await gate;await route.fulfill({json:{challengeId:randomUUID(),retryAfter:0,message:'Your code has been sent.'}});});
  await page.goto('/booking/');await page.getByLabel('Mobile number',{exact:true}).fill('+447700900333');
  await page.getByRole('heading',{name:'Your bookings',exact:true}).click();
  await expect(page.locator('[data-code-entry]')).toBeHidden();
  await page.getByRole('button',{name:'Send SMS code',exact:true}).click();
  await expect(page.locator('[data-verification-status]')).toHaveText('Sending your code…');
  await page.getByLabel('Email address',{exact:true}).fill('changed@example.test');release();
  await expect(page.locator('[data-code-entry]')).toBeHidden();
  await page.route('**/api/booker/request-code/**',route=>route.fulfill({status:503,json:{error:'The code could not be sent. Try again.'}}));
  await page.getByRole('button',{name:'Send verification code',exact:true}).click();
  await expect(page.locator('[data-verification-status]')).toContainText('could not be sent');
  await page.route('**/api/booker/request-code/**',route=>route.fulfill({json:{challengeId:randomUUID(),retryAfter:0,message:'Your code has been sent.'}}));
  await page.route('**/api/booker/verify-code/**',route=>route.fulfill({status:400,json:{error:'The code has expired. Request another code.'}}));
  await page.getByRole('button',{name:'Send verification code',exact:true}).click();
  await page.getByLabel('Verification code',{exact:true}).fill('123456');
  await page.getByRole('button',{name:'Verify code',exact:true}).click();
  await expect(page.locator('[data-verification-status]')).toContainText('expired');
  await expect(page.locator('[data-code-entry]')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth)).toBe(false);
});


test('an already verified mobile remains sufficient when an unverified email is also supplied', async ({page}) => {
  await page.route('**/api/booker/session/**',route=>route.fulfill({json:{identities:[{channel:'sms',identifier:'+447700900222'}],grants:[]}}));
  let deliveries=0;
  await page.route('**/api/booker/request-code/**',route=>{deliveries++;return route.fulfill({status:503,json:{error:'Unexpected delivery'}});});
  await page.goto('/book/?propertyId=bespoke-arrangement&arrival=2099-10-19&departure=2099-10-23&adults=2');
  await page.getByRole('link',{name:'Start a bespoke request'}).click();
  await page.getByLabel('Mobile number',{exact:true}).fill('+447700900222');
  await page.getByLabel('Booker email').fill('unverified@example.test');
  await page.getByLabel('Message to Olrig Bank (optional)').focus();
  await expect(page.locator('[data-booker-verification]')).toHaveAttribute('data-verified','true');
  await expect(page.getByRole('combobox',{name:'Verification contact'})).toHaveValue('sms');
  expect(deliveries).toBe(0);
});

test('private navigation supports keyboard access, dismissal and public destinations', async ({page}) => {
  await page.goto('/booking/');
  await expect(page.locator('.booker-brand')).toHaveText('');
  await expect(page.locator('.booker-brand')).toHaveAccessibleName('Olrig Bank Kendal — Your bookings');
  const skip = page.getByRole('link', {name:'Skip to main content'});
  expect(await skip.evaluate(element => element.getBoundingClientRect().bottom)).toBeLessThanOrEqual(0);
  await page.keyboard.press('Tab');
  await expect(skip).toBeFocused();
  expect(await skip.evaluate(element => element.getBoundingClientRect().top)).toBeGreaterThanOrEqual(0);
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
  const account = page.locator('summary[aria-label="Booking account"]');
  const menu = page.locator('summary').filter({hasText:'Menu'});
  await account.focus();await page.keyboard.press('Enter');
  await expect(page.getByRole('link',{name:'Sign in',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Log out'})).toHaveCount(0);
  await menu.click();
  await expect(page.getByRole('link',{name:'Sign in',exact:true})).toBeHidden();
  const navigation = page.getByRole('navigation',{name:'Public navigation'});
  await expect(navigation.getByRole('link')).toHaveCount(7);
  expect(await navigation.getByRole('link').evaluateAll(links => links.map(link => link.getAttribute('href')))).toEqual(['/', '/#guest-reviews', '/book/', '/listings/', '/guest-information/', '/local-guide/', '/contact/']);
  expect(await navigation.evaluate(element => { const rect=element.getBoundingClientRect();return rect.left>=0 && rect.right<=document.documentElement.clientWidth; })).toBe(true);
  await page.keyboard.press('Tab');await expect(navigation.getByRole('link',{name:'Home',exact:true})).toBeFocused();
  await page.keyboard.press('Escape');await expect(navigation).toBeHidden();await expect(menu).toBeFocused();
  await menu.click();await page.mouse.click(5,200);await expect(navigation).toBeHidden();
  await menu.click();await navigation.getByRole('link',{name:'Contact',exact:true}).click();await expect(page).toHaveURL(/\/contact\/$/);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth)).toBe(false);
});

test('email-backed account adds, replaces and removes SMS sign-in through real verification endpoints',async({page,context,request,baseURL})=>{
  const db=new pg.Client(process.env.DATABASE_URL ? {connectionString:process.env.DATABASE_URL} : {host:'127.0.0.1',port:5433,user:process.env.POSTGRES_USER||'soccotash',password:process.env.POSTGRES_PASSWORD,database:process.env.POSTGRES_DB||'soccotash'});
  await db.connect();const email=`e14-${randomUUID()}@example.test`;
  const mobiles=['+447400'+String(Math.floor(Math.random()*1000000)).padStart(6,'0'),'+316'+String(Math.floor(Math.random()*100000000)).padStart(8,'0')];
  let accountId='';const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
  try {
    accountId=(await db.query('INSERT INTO booker_accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    await db.query("INSERT INTO booker_identities(channel,identifier,account_id) VALUES('email',$1,$2)",[email,accountId]);
    const token=randomBytes(32).toString('base64url');
    await db.query("INSERT INTO booker_sessions(token_hash,account_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '1 hour')",[hash(token),accountId]);
    await context.addCookies([{name:'olrig_booker_session',value:token,url:baseURL!,httpOnly:true,sameSite:'Lax'}]);
    await page.goto('/booking/');await expect(page.getByText('There are no accessible bookings linked to this account.')).toBeVisible();
    await page.locator('summary[aria-label="Booking account"]').click();await page.getByRole('link',{name:'Sign-in details',exact:true}).click();
    const codeFor=async(recipient:string)=>{
      let code='';await expect.poll(async()=>{code=(await(await request.get(`http://127.0.0.1:1027/?recipient=${encodeURIComponent(recipient)}`)).json()).code;return Boolean(code);}).toBe(true);return code;
    };
    for(const [index,mobile] of mobiles.entries()) {
      if(index)await db.query("UPDATE booker_verification_requests SET created_at=NOW()-INTERVAL '2 minutes' WHERE destination_hash=$1",[hash(`email:${email}`)]);
      let smsRequests=0;const listener=(r:any)=>{if(r.url().endsWith('/api/booker/mobile/') && r.postDataJSON()?.step==='send')smsRequests++;};page.on('request',listener);
      await page.getByLabel('Mobile number',{exact:true}).fill(mobile);
      await page.getByRole('button',{name:'Send email code',exact:true}).click();
      await expect(page.locator('[data-status]')).toContainText('email code has been sent');
      await page.getByLabel('Verification code',{exact:true}).fill(await codeFor(email));await page.getByRole('button',{name:'Verify code',exact:true}).click();
      await expect(page.locator('[data-status]')).toContainText('Email verified');expect(smsRequests).toBe(0);
      await expect(page.getByRole('button',{name:'Send SMS code',exact:true})).toBeFocused();
      await page.getByRole('button',{name:'Send SMS code',exact:true}).click();
      await expect(page.locator('[data-status]')).toContainText('SMS code has been sent');
      await page.getByLabel('Verification code',{exact:true}).fill('abc');await page.getByRole('button',{name:'Verify code',exact:true}).click();
      await expect(page.locator('[data-status]')).toContainText('six-digit');
      await page.getByLabel('Verification code',{exact:true}).fill(await codeFor(mobile));await page.getByLabel('Verification code',{exact:true}).press('Enter');
      await expect(page).toHaveURL(/\/booking\/account\/\?updated=1/);await expect(page.getByText(mobile,{exact:true})).toBeVisible();
      page.off('request',listener);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth)).toBe(false);
    }
    expect((await db.query('SELECT COUNT(*)::int AS n FROM booker_sessions WHERE account_id=$1',[accountId])).rows[0].n).toBe(1);
    // Prove the replacement number signs in before removing it.
    await page.locator('summary[aria-label="Booking account"]').click();await page.getByRole('button',{name:'Log out'}).click();
    await db.query("UPDATE booker_verification_requests SET created_at=NOW()-INTERVAL '2 minutes' WHERE destination_hash=$1",[hash(`sms:${mobiles[1]}`)]);
    await page.getByLabel('Mobile number',{exact:true}).fill(mobiles[1]);await page.getByRole('heading',{name:'Your bookings',exact:true}).click();
    await expect(page.locator('[data-code-entry]')).toBeHidden();await page.getByRole('button',{name:'Send SMS code',exact:true}).click();
    await expect(page.locator('[data-code-entry]')).toBeVisible();await page.getByLabel('Verification code',{exact:true}).fill(await codeFor(mobiles[1]));await page.getByRole('button',{name:'Verify code',exact:true}).click();
    await expect(page.getByText('There are no accessible bookings linked to this account.')).toBeVisible();
    await page.goto('/booking/account/');await page.getByRole('combobox',{name:'Action',exact:true}).selectOption('remove');
    await expect(page.getByLabel('Mobile number',{exact:true})).toBeHidden();
    await db.query("UPDATE booker_verification_requests SET created_at=NOW()-INTERVAL '2 minutes' WHERE destination_hash=$1",[hash(`email:${email}`)]);
    await page.getByRole('button',{name:'Send email code',exact:true}).click();await expect(page.locator('[data-status]')).toContainText('email code has been sent');
    await page.getByLabel('Verification code',{exact:true}).fill(await codeFor(email));await page.getByRole('button',{name:'Verify code',exact:true}).click();
    await expect(page).toHaveURL(/updated=1/);await expect(page.getByText('Verified mobile',{exact:true})).toHaveCount(0);
    expect((await db.query("SELECT channel FROM booker_identities WHERE account_id=$1",[accountId])).rows).toEqual([{channel:'email'}]);expect(errors).toEqual([]);
    expect((await page.request.post('/api/booker/mobile/',{headers:{origin:'https://foreign.example'},data:{step:'start',action:'remove'}})).status()).toBe(403);
  }finally{
    if(accountId){await db.query('DELETE FROM booker_identities WHERE account_id=$1',[accountId]);await db.query('DELETE FROM booker_accounts WHERE id=$1',[accountId]);}
    for(const identifier of [email,...mobiles]){await db.query('DELETE FROM booker_challenges WHERE identifier=$1',[identifier]);await db.query('DELETE FROM booker_verification_requests WHERE destination_hash=$1',[hash(`${identifier===email?'email':'sms'}:${identifier}`)]);}
    await db.end();
  }
});
