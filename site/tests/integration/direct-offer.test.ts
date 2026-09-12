import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import test from 'node:test';
import pg from 'pg';
registerHooks({ resolve(specifier, context, next) { try { return next(specifier, context); } catch (error) {
  if (!specifier.startsWith('.') || /\.[a-z0-9]+$/i.test(specifier)) throw error;
  return next(`${specifier}.ts`, context);
} } });

test('direct offers are atomic, preserve review exceptions and retain the existing lifecycle', async t => {
  const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
  assert.ok(databaseUrl);
  assert.ok(['localhost', '127.0.0.1'].includes(new URL(databaseUrl).hostname), 'Disposable schemas require a local database.');
  const schema = `direct_offer_${crypto.randomBytes(8).toString('hex')}`;
  const control = new pg.Pool({ connectionString: databaseUrl });
  let db: pg.Pool | undefined;
  try {
    await control.query(`CREATE SCHEMA ${schema}`);
    const url = new URL(databaseUrl); url.searchParams.set('options', `-c search_path=${schema},public`);
    process.env.DATABASE_URL = url.toString(); process.env.DATABASE_SSL = 'false';
    const migration = new pg.Pool({ connectionString: url.toString() });
    try {
      const directory = new URL('../../db/', import.meta.url);
      for (const file of (await readdir(directory)).filter(f => f.endsWith('.sql')).sort()) await migration.query(await readFile(new URL(file, directory), 'utf8'));
    } finally { await migration.end(); }
    const repository = await import('../../src/lib/booking/repository.ts');
    const { bookerContext } = await import('../../src/lib/booker/context.ts');
    const { getPool } = await import('../../src/lib/booking/db.ts');
    const { getPublishedPricingQuote } = await import('../../src/lib/pricing/public.ts');
    const { assessPublishedOccupancy } = await import('../../src/lib/occupancy/assessment.ts');
    db = getPool();
    await db.query("UPDATE pricing_plans SET status='archived' WHERE status='published'");
    const plan = (await db.query("INSERT INTO pricing_plans(property_id,name,status,version,published_at) VALUES('main-house','E15 fixture','published',100,NOW()) RETURNING id")).rows[0];
    await db.query(`INSERT INTO pricing_rules(plan_id,type,name,action) VALUES($1,'default_nightly_price','Nightly stay','{"amountPence":30000}')`, [plan.id]);
    for (const [type, action] of [['deposit_percentage', { percentage: 25 }], ['initial_payment_deadline', { days: 7 }], ['balance_payment_deadline', { days: 42 }]] as const) await db.query('INSERT INTO pricing_rules(plan_id,type,name,action,position) VALUES($1,$2,$2,$3::jsonb,(SELECT COALESCE(MAX(position),0)+10 FROM pricing_rules WHERE plan_id=$1))', [plan.id, type, JSON.stringify(action)]);
    await db.query("UPDATE occupancy_policies SET status='archived' WHERE status='published'");
    const policy = (await db.query("INSERT INTO occupancy_policies(property_id,name,status,version,published_at) VALUES('main-house','E15 fixture','published',100,NOW()) RETURNING id")).rows[0];
    for (const subject of ['guests','adults','children','infants','pets','service_animals']) await db.query("INSERT INTO occupancy_rules(policy_id,subject,maximum_standard_count,exceed_outcome) VALUES($1,$2,8,'host_decision_required')", [policy.id,subject]);
    const base = { propertyId: 'main-house', arrival: '2099-10-19', departure: '2099-10-23', guests: 2, pets: 0, name: 'E15 disposable', email: 'e15@example.test', publishDirectOffer: true };
    const pricingQuote = await getPublishedPricingQuote({ ...base, bookingDate: '2026-09-12', channel: 'direct', cancellationPlan: 'flexible' });
    assert.ok(pricingQuote);
    const occupancyAssessment = await assessPublishedOccupancy(base.propertyId, { adults: 2, children: 0, infants: 0, pets: 0, serviceAnimals: 0 });
    assert.equal(occupancyAssessment.result.outcome, 'standard');
    const input = { ...base, pricingQuote, occupancyAssessment };
    await t.test('publishes a first offer with matching price, defaults and system attribution', async () => {
      const booking = await repository.createProvisionalBooking(input);
      const saved = await repository.getProvisionalBookingRequest(booking.reference);
      assert.equal(saved?.status, 'offered');
      const [offer] = await repository.getBookingOffers(booking.reference);
      assert.equal(offer.totalPence, pricingQuote.result.guestTotalPence);
      assert.equal(offer.lineItems.reduce((sum, line) => sum + line.amountPence, 0), offer.totalPence);
      assert.equal(offer.customerStatus, 'active');
      assert.equal(offer.validUntil, new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
      const activity = (await db!.query("SELECT actor FROM booking_activity WHERE booking_offer_id=$1 AND event_type='offer_published'", [offer.id])).rows;
      assert.deepEqual(activity, [{ actor: 'system' }]);
      const messages = (await db!.query('SELECT body FROM booking_messages WHERE provisional_booking_id=$1', [saved!.id])).rows;
      assert.ok(messages.every(row => !row.body.includes('Jenna will review')));
      await repository.markBookingOfferFailed(offer.id, new Error('Disposable delivery failure'));
      assert.equal((await repository.getProvisionalBookingRequest(booking.reference))?.status, 'offered');
      await assert.rejects(repository.createProvisionalBooking(input), /DATES_UNAVAILABLE/);
      await db!.query('DELETE FROM provisional_bookings WHERE public_id=$1', [booking.reference]);
    });
    await t.test('review exceptions remain pending without an offer', async () => {
      for (const change of [{ promoCode: 'TEST' }, { propertyId: 'whole-property' }, { propertyId: 'bespoke-arrangement' }, { pricingQuote: null }, { occupancyAssessment: { ...occupancyAssessment, result: { ...occupancyAssessment.result, outcome: 'host_decision_required' as const } } }]) {
        const booking = await repository.createProvisionalBooking({ ...input, ...change });
        assert.equal((await repository.getProvisionalBookingRequest(booking.reference))?.status, 'pending');
        assert.equal((await repository.getBookingOffers(booking.reference)).length, 0);
        await db!.query('DELETE FROM provisional_bookings WHERE public_id=$1', [booking.reference]);
      }
    });
    await t.test('direct offers can be accepted, declined or expired through the existing lifecycle', async () => {
      const accountId = (await db!.query('INSERT INTO booker_accounts DEFAULT VALUES RETURNING id')).rows[0].id;
      for (const action of ['accept', 'decline', 'expire'] as const) {
        const booking = await repository.createProvisionalBooking(input);
        await db!.query('UPDATE provisional_bookings SET booker_account_id=$2 WHERE public_id=$1', [booking.reference, accountId]);
        if (action === 'expire') {
          await db!.query("UPDATE booking_offers SET valid_until=CURRENT_DATE-1 WHERE provisional_booking_id=(SELECT id FROM provisional_bookings WHERE public_id=$1)", [booking.reference]);
          await repository.expireElapsedBookingOffers();
        } else await bookerContext.run({ accountId }, () => repository.respondToCustomerBookingOffer(booking.reference, action));
        assert.equal((await repository.getProvisionalBookingRequest(booking.reference))?.status, action === 'accept' ? 'payment_pending' : action === 'decline' ? 'declined' : 'expired');
        await db!.query('DELETE FROM provisional_bookings WHERE public_id=$1', [booking.reference]);
      }
      await db!.query('DELETE FROM booker_accounts WHERE id=$1', [accountId]);
    });
    await t.test('a publication failure rolls back the booking as well as the offer', async () => {
      await db!.query(`CREATE FUNCTION reject_e15_offer() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'E15 publication failure'; END $$;
        CREATE TRIGGER reject_e15_offer BEFORE INSERT ON booking_offers FOR EACH ROW EXECUTE FUNCTION reject_e15_offer()`);
      await assert.rejects(repository.createProvisionalBooking(input), /E15 publication failure/);
      assert.equal((await db!.query('SELECT count(*)::int AS count FROM provisional_bookings')).rows[0].count, 0);
    });
  } finally {
    await db?.end();
    await control.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await control.end();
  }
});
