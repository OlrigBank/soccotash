import { test, expect } from '@playwright/test';
import pg from 'pg';
import { randomUUID, randomBytes, createHash } from 'node:crypto';

test.use({ trace: 'off', video: 'off', screenshot: 'off' });
for (const width of [390, 768, 1440]) {
  test(`priced standard request publishes one offer at ${width}px`, async ({ page, baseURL }) => {
    const origin = new URL(baseURL!).origin;
    if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw new Error('Local fixtures only.');
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString || !['localhost', '127.0.0.1'].includes(new URL(connectionString).hostname)) throw new Error('Local database required.');
    const db = new pg.Client({ connectionString }); await db.connect();
    const name = `E15 disposable ${randomUUID()}`;
    let accountId: string | undefined;
    let planId: string | undefined, policyId: string | undefined;
    let previousPlans: string[] = [], previousPolicies: string[] = [];
    try {
      previousPlans = (await db.query("UPDATE pricing_plans SET status='archived' WHERE property_id='main-house' AND status='published' RETURNING id")).rows.map(row => row.id);
      previousPolicies = (await db.query("UPDATE occupancy_policies SET status='archived' WHERE property_id='main-house' AND status='published' RETURNING id")).rows.map(row => row.id);
      planId = (await db.query("INSERT INTO pricing_plans(property_id,name,status,version,published_at) VALUES('main-house',$1,'published',100,NOW()) RETURNING id", [name])).rows[0].id;
      await db.query(`INSERT INTO pricing_rules(plan_id,type,name,action) VALUES($1,'default_nightly_price','Nightly stay','{"amountPence":30000}')`, [planId]);
    for (const [type, action] of [['deposit_percentage', { percentage: 25 }], ['initial_payment_deadline', { days: 7 }], ['balance_payment_deadline', { days: 42 }]] as const) await db.query('INSERT INTO pricing_rules(plan_id,type,name,action,position) VALUES($1,$2,$2,$3::jsonb,(SELECT COALESCE(MAX(position),0)+10 FROM pricing_rules WHERE plan_id=$1))', [planId, type, JSON.stringify(action)]);
      policyId = (await db.query("INSERT INTO occupancy_policies(property_id,name,status,version,published_at) SELECT 'main-house',$1,'published',COALESCE(MAX(version),0)+1,NOW() FROM occupancy_policies WHERE property_id='main-house' RETURNING id", [name])).rows[0].id;
      for (const subject of ['guests','adults','children','infants','pets','service_animals']) await db.query("INSERT INTO occupancy_rules(policy_id,subject,maximum_standard_count,exceed_outcome) VALUES($1,$2,8,'host_decision_required')", [policyId,subject]);
      accountId = (await db.query('INSERT INTO booker_accounts DEFAULT VALUES RETURNING id')).rows[0].id;
      const mobile = '+447700900824';
      await db.query("INSERT INTO booker_identities(channel,identifier,account_id) VALUES('sms',$1,$2)", [mobile, accountId]);
      const token = randomBytes(32).toString('base64url');
      await db.query("INSERT INTO booker_sessions(token_hash,account_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '1 hour')", [createHash('sha256').update(token).digest('hex'), accountId]);
      await page.context().addCookies([{ name: 'olrig_booker_session', value: token, url: origin, httpOnly: true, sameSite: 'Lax' }]);
      await page.setViewportSize({ width, height: 900 });
      const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
      await page.goto('/book/?propertyId=main-house&arrival=2099-10-19&departure=2099-10-23&adults=2&children=0&infants=0&pets=0&bookingContinue=checked');
      await expect(page.locator('[data-stay-summary]')).toContainText('Total: £');
      await expect(page.locator('[data-stay-summary]')).not.toContainText('Jenna');
      await page.getByLabel('Booker name').fill(name);
      await page.getByLabel('Mobile number', { exact: true }).fill(mobile);
      await page.getByLabel('Booker name').focus();
      await page.getByRole('button', { name: 'Continue to review' }).click();
      await expect(page.locator('[data-booking-submit-review]')).toContainText('receive an offer at this total');
      const total = await page.locator('[data-booking-submit-review] > strong').innerText();
      const submitted = page.waitForRequest(request => request.url().endsWith('/api/provisional-bookings/') && request.method() === 'POST');
      await page.getByRole('button', { name: 'Request booking', exact: true }).click();
      const request = await submitted;
      await expect(page).toHaveURL(/\/booking\/manage\/[^/]+\/(?:reservation\/)?$/);
      await expect(page.getByRole('heading', { name: 'Current offer', exact: true })).toBeVisible();
      await expect(page.locator('body')).toContainText(total.replace('Total: ', ''));
      await expect(page.locator('body')).not.toContainText('while Jenna and the team review');
      const replay = await page.request.post('/api/provisional-bookings/', { headers: { origin }, data: request.postDataJSON() });
      expect(replay.status()).toBe(201); expect((await replay.json()).status).toBe('offered');
      const saved = (await db.query('SELECT id,status FROM provisional_bookings WHERE guest_name=$1', [name])).rows;
      expect(saved).toHaveLength(1); expect(saved[0].status).toBe('offered');
      expect((await db.query('SELECT count(*)::int AS count FROM booking_offers WHERE provisional_booking_id=$1', [saved[0].id])).rows[0].count).toBe(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(errors).toEqual([]);
      // Revalidation must happen before another booking can be created.
      const stale = { ...request.postDataJSON(), submissionId: randomUUID(), reviewedPricing: { pricingAvailable: true, planId: '0', planVersion: 0, guestTotalPence: 1 } };
      const changed = await page.request.post('/api/provisional-bookings/', { headers: { origin }, data: stale });
      expect(changed.status()).toBe(409); expect((await changed.json()).quote.guestTotalPence).toBeGreaterThan(1);
      const missingReview = await page.request.post('/api/provisional-bookings/', { headers: { origin }, data: { ...stale, reviewedPricing: null } });
      expect(missingReview.status()).toBe(409);
      await db.query('DELETE FROM provisional_bookings WHERE guest_name=$1', [name]);
      const promo = await page.request.post('/api/provisional-bookings/', { headers: { origin }, data: { ...request.postDataJSON(), submissionId: randomUUID(), promoCode: 'TEST' } });
      expect(promo.status()).toBe(201); const pending = await promo.json(); expect(pending.status).toBe('pending');
      await page.goto(pending.managePath);
      await expect(page.getByRole('heading', { name: 'Current offer', exact: true })).toHaveCount(0);
      const noLongerPriced = await page.request.post('/api/provisional-bookings/', { headers: { origin }, data: { ...stale, propertyId: 'bespoke-arrangement' } });
      expect(noLongerPriced.status()).toBe(409); expect((await noLongerPriced.json()).quote.pricingAvailable).toBe(false);
      if (width === 390) {
        await db.query('DELETE FROM provisional_bookings WHERE guest_name=$1', [name]);
        const concurrentData = { ...request.postDataJSON(), submissionId: randomUUID() };
        const responses = await Promise.all([1, 2].map(() => page.request.post('/api/provisional-bookings/', { headers: { origin }, data: concurrentData })));
        for (const response of responses) { expect(response.status()).toBe(201); expect((await response.json()).status).toBe('offered'); }
        const bookings = (await db.query('SELECT id FROM provisional_bookings WHERE guest_name=$1', [name])).rows;
        expect(bookings).toHaveLength(1);
        expect((await db.query('SELECT count(*)::int AS count FROM booking_offers WHERE provisional_booking_id=$1', [bookings[0].id])).rows[0].count).toBe(1);
        const notifications = (await db.query('SELECT event_type FROM booking_notification_events WHERE provisional_booking_id=$1', [bookings[0].id])).rows;
        expect(notifications).toEqual([{ event_type: 'booking_offer_available' }]);
      }


    } finally {
      await db.query('DELETE FROM provisional_bookings WHERE guest_name=$1', [name]);
      if (accountId) { await db.query('DELETE FROM booker_identities WHERE account_id=$1', [accountId]); await db.query('DELETE FROM booker_accounts WHERE id=$1', [accountId]); }
      if (planId) await db.query('DELETE FROM pricing_plans WHERE id=$1', [planId]);
      if (policyId) await db.query('DELETE FROM occupancy_policies WHERE id=$1', [policyId]);
      await db.query("UPDATE pricing_plans SET status='published' WHERE id=ANY($1::bigint[])", [previousPlans]);
      await db.query("UPDATE occupancy_policies SET status='published' WHERE id=ANY($1::bigint[])", [previousPolicies]);
      await db.end();
    }
  });
}
