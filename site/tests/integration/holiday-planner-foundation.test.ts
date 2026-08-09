import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';

import {
  addPlanDay,
  addPlanItem,
  addPlanCandidateActivity,
  addPlanGuideCandidates,
  archiveExamplePlan,
  createExamplePlan,
  createBookingLinkedPlan,
  createPlanAiCapability,
  createPlanShareLink,
  copyPublishedExampleIntoBookingPlan,
  duplicateExamplePlan,
  getHolidayPlan,
  getBookingLinkedPlanByBookingReference,
  invitePlanParticipant,
  listPlanParticipants,
  listGuideContributions,
  listGuideContributionModerationQueue,
  listExamplePlans,
  listPublishedExamplePlans,
  listPlanShareLinks,
  listPlanAiCapabilities,
  movePlanDay,
  movePlanItem,
  movePlanCandidateActivity,
  moderateGuideContribution,
  offerGuideContribution,
  publishExamplePlan,
  removePlanDay,
  removePlanItem,
  returnPlanItemToCandidates,
  revokePlanParticipant,
  revokePlanAiCapability,
  revokePlanShareLink,
  setPlanItemGuideReference,
  schedulePlanCandidateActivity,
  updateExamplePlan,
  updateBookingLinkedPlan,
  changePlanParticipantRole,
  updatePlanDay,
  updatePlanItem,
  unpublishExamplePlan,
  withdrawGuideContribution,
  getPublishedExamplePlanBySlug,
} from '../../src/lib/planner/repository.ts';
import { PlannerError } from '../../src/lib/planner/types.ts';
import { resolveParticipantCredential } from '../../src/lib/planner/participant-access.ts';
import { resolvePlanShareCredential } from '../../src/lib/planner/share-access.ts';
import { authorizeAiCapabilityRequest, resolveAiCapabilityCredential } from '../../src/lib/planner/ai-capability-access.ts';
import { acceptAiProposal, rejectAiProposal, storeAiProposal } from '../../src/lib/planner/ai-proposals.ts';

const { Pool } = pg;
const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

function scopedDatabaseUrl(baseUrl: string, schema: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set('options', `-c search_path=${schema},public`);
  return url.toString();
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function databaseSsl(): { rejectUnauthorized: false } | undefined {
  return process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined;
}

test('persists structured plans and makes every mutation an atomic revision', async () => {
  assert.ok(databaseUrl, 'Set TEST_DATABASE_URL or DATABASE_URL to run the PostgreSQL integration test.');

  const schema = `holiday_planner_${process.pid}_${crypto.randomBytes(6).toString('hex')}`;
  const controlPool = new Pool({ connectionString: databaseUrl, ssl: databaseSsl(), max: 1 });
  const applicationPool = new Pool({
    connectionString: scopedDatabaseUrl(databaseUrl, schema),
    ssl: databaseSsl(),
    max: 3,
  });

  try {
    await controlPool.query(`CREATE SCHEMA ${quoteIdentifier(schema)}`);
    const migrationDirectory = new URL('../../db/', import.meta.url);
    const migrationFiles = (await readdir(migrationDirectory)).filter((name) => name.endsWith('.sql')).sort();
    for (const filename of migrationFiles) {
      await applicationPool.query(await readFile(new URL(filename, migrationDirectory), 'utf8'));
    }

    const guideRows = await applicationPool.query<{ canonical_slug: string; public_id: string }>(
      `SELECT canonical_slug, public_id::text FROM local_guide_entries WHERE canonical_slug IN ('kendalcastle', 'fellfoot')`,
    );
    const guideIds = Object.fromEntries(guideRows.rows.map((row) => [row.canonical_slug, row.public_id]));

    const admin = await applicationPool.query<{ id: string | number }>(
      `INSERT INTO admin_users (email, display_name, password_hash)
       VALUES ('planner@example.invalid', 'Planner Admin', 'not-a-real-password-hash') RETURNING id`,
    );
    const actor = { type: 'administrator' as const, adminUserId: String(admin.rows[0].id) };

    const created = await createExamplePlan({
      title: 'Three days around Kendal',
      description: 'A reusable example itinerary.',
      durationDays: 3,
      actor,
    }, applicationPool);
    assert.equal(created.planType, 'example');
    assert.equal(created.revision, 1);
    assert.equal(created.revisions[0].action, 'plan_created');
    assert.match(created.id, /^[0-9a-f-]{36}$/);

    const firstDay = await addPlanDay({
      planId: created.id,
      expectedRevision: 1,
      title: 'Day one',
      summary: 'Kendal on foot',
      actor,
    }, applicationPool);
    assert.equal(firstDay.revision, 2);

    const item = await addPlanItem({
      planId: created.id,
      dayId: firstDay.dayId,
      expectedRevision: 2,
      title: 'Visit Kendal Castle',
      description: 'Leave Olrig Bank after breakfast.',
      itemType: 'activity',
      startTime: '10:00',
      endTime: '12:00',
      localGuideEntryId: guideIds.kendalcastle,
      status: 'proposed',
      actor,
    }, applicationPool);
    assert.equal(item.revision, 3);

    const secondDay = await addPlanDay({
      planId: created.id,
      expectedRevision: 3,
      title: 'Day two',
      actor,
    }, applicationPool);
    await addPlanItem({
      planId: created.id,
      dayId: secondDay.dayId,
      expectedRevision: 4,
      title: 'Flexible afternoon',
      itemType: 'free_time',
      actor,
    }, applicationPool);

    const plan = await getHolidayPlan(created.id, applicationPool);
    assert.ok(plan);
    assert.equal(plan.revision, 5);
    assert.deepEqual(plan.days.map((day) => day.position), [10, 20]);
    assert.equal(plan.days[0].items[0].localGuideSlug, 'kendalcastle');
    assert.equal(plan.days[1].items[0].localGuideSlug, null);
    assert.deepEqual(plan.revisions.map((revision) => revision.revision), [1, 2, 3, 4, 5]);
    assert.deepEqual(plan.revisions.map((revision) => revision.action), [
      'plan_created', 'day_added', 'item_added', 'day_added', 'item_added',
    ]);

    await assert.rejects(
      addPlanDay({ planId: created.id, expectedRevision: 4, title: 'Stale day', actor }, applicationPool),
      (error: unknown) => error instanceof PlannerError && error.code === 'STALE_REVISION',
    );
    const afterStaleWrite = await getHolidayPlan(created.id, applicationPool);
    assert.equal(afterStaleWrite?.revision, 5);
    assert.equal(afterStaleWrite?.days.length, 2);

    await assert.rejects(
      addPlanItem({
        planId: created.id,
        dayId: firstDay.dayId,
        expectedRevision: 5,
        title: 'Bad guide reference',
        itemType: 'activity',
        localGuideEntryId: '../private-note',
        actor,
      }, applicationPool),
      (error: unknown) => error instanceof PlannerError && error.code === 'VALIDATION_ERROR',
    );

    await assert.rejects(
      addPlanDay({
        planId: created.id,
        expectedRevision: 5,
        title: 'Impossible date',
        date: '2026-02-30',
        actor,
      }, applicationPool),
      (error: unknown) => error instanceof PlannerError && error.code === 'VALIDATION_ERROR',
    );
    await assert.rejects(
      addPlanItem({
        planId: created.id,
        dayId: firstDay.dayId,
        expectedRevision: 5,
        title: 'Invalid time',
        itemType: 'activity',
        startTime: '25:00',
        actor,
      }, applicationPool),
      (error: unknown) => error instanceof PlannerError && error.code === 'VALIDATION_ERROR',
    );
    await assert.rejects(
      getHolidayPlan('not-a-uuid', applicationPool),
      (error: unknown) => error instanceof PlannerError && error.code === 'VALIDATION_ERROR',
    );

    await assert.rejects(
      createExamplePlan({
        title: 'Must roll back',
        actor: { type: 'administrator', adminUserId: '999999999' },
      }, applicationPool),
      /foreign key constraint/,
    );
    const rolledBack = await applicationPool.query(
      `SELECT count(*)::int AS count FROM holiday_plans WHERE title = 'Must roll back'`,
    );
    assert.equal(rolledBack.rows[0].count, 0, 'a failed revision write must roll back plan creation');

    assert.equal(await updateExamplePlan({
      planId: created.id, expectedRevision: 5, title: 'Three better days around Kendal',
      description: 'Updated by an administrator.', durationDays: 3, actor,
    }, applicationPool), 6);
    assert.equal(await updatePlanDay({
      planId: created.id, dayId: firstDay.dayId, expectedRevision: 6,
      title: 'Kendal day', summary: 'Updated summary', actor,
    }, applicationPool), 7);
    assert.equal(await movePlanDay({
      planId: created.id, dayId: secondDay.dayId, expectedRevision: 7, direction: 'up', actor,
    }, applicationPool), 8);
    let administered = await getHolidayPlan(created.id, applicationPool);
    assert.deepEqual(administered?.days.map((day) => day.id), [secondDay.dayId, firstDay.dayId]);
    assert.equal(await removePlanDay({
      planId: created.id, dayId: firstDay.dayId, expectedRevision: 8, actor,
    }, applicationPool), 9);
    assert.equal(await archiveExamplePlan({
      planId: created.id, expectedRevision: 9, actor,
    }, applicationPool), 10);
    administered = await getHolidayPlan(created.id, applicationPool);
    assert.ok(administered?.archivedAt);
    assert.equal(administered?.publicationStatus, 'unpublished');
    assert.equal(administered?.visibility, 'private');
    assert.equal(administered?.revisions.at(-1)?.action, 'plan_archived');
    const summaries = await listExamplePlans(applicationPool);
    assert.equal(summaries.find((summary) => summary.id === created.id)?.dayCount, 1);
    await assert.rejects(
      addPlanDay({ planId: created.id, expectedRevision: 10, title: 'Archived day', actor }, applicationPool),
      (error: unknown) => error instanceof PlannerError && error.code === 'NOT_FOUND',
    );

    const dated = await createExamplePlan({
      title: 'Dated example', startsOn: '2026-09-12', endsOn: '2026-09-14', actor,
    }, applicationPool);
    await assert.rejects(
      addPlanDay({ planId: dated.id, expectedRevision: 1, title: 'Missing date', actor }, applicationPool),
      (error: unknown) => error instanceof PlannerError && error.code === 'VALIDATION_ERROR',
    );
    await assert.rejects(
      addPlanDay({ planId: dated.id, expectedRevision: 1, title: 'Outside stay', date: '2026-09-15', actor }, applicationPool),
      (error: unknown) => error instanceof PlannerError && error.code === 'VALIDATION_ERROR',
    );
    const datedDay = await addPlanDay({
      planId: dated.id, expectedRevision: 1, title: 'Arrival day', date: '2026-09-12', actor,
    }, applicationPool);
    assert.equal(datedDay.revision, 2);
    const datedDayTwo = await addPlanDay({ planId: dated.id, expectedRevision: 2, title: 'Second day', date: '2026-09-13', actor }, applicationPool);
    const breakfast = await addPlanItem({ planId: dated.id, dayId: datedDay.dayId, expectedRevision: 3, title: 'Breakfast', itemType: 'meal', startTime: '08:00', endTime: '09:00', actor }, applicationPool);
    const walk = await addPlanItem({ planId: dated.id, dayId: datedDay.dayId, expectedRevision: 4, title: 'Morning walk', itemType: 'activity', actor }, applicationPool);
    assert.equal(await updatePlanItem({ planId: dated.id, itemId: breakfast.itemId, expectedRevision: 5, title: 'Breakfast booking', itemType: 'reservation', startTime: '08:00', endTime: '09:00', status: 'proposed', visibility: 'participants', actor }, applicationPool), 6);
    await assert.rejects(updatePlanItem({ planId: dated.id, itemId: breakfast.itemId, expectedRevision: 6, title: 'Invalid leap', itemType: 'reservation', status: 'booked', visibility: 'participants', actor }, applicationPool), (error:unknown)=>error instanceof PlannerError&&error.code==='VALIDATION_ERROR');
    assert.equal(await movePlanItem({ planId: dated.id, itemId: walk.itemId, targetDayId: datedDay.dayId, expectedRevision: 6, position: 'up', actor }, applicationPool), 7);
    let itemPlan = await getHolidayPlan(dated.id, applicationPool);
    assert.deepEqual(itemPlan?.days[0].items.map(item=>item.id), [walk.itemId, breakfast.itemId]);
    assert.equal(await movePlanItem({ planId: dated.id, itemId: breakfast.itemId, targetDayId: datedDayTwo.dayId, expectedRevision: 7, position: 'end', actor }, applicationPool), 8);
    itemPlan = await getHolidayPlan(dated.id, applicationPool);
    assert.equal(itemPlan?.days[1].items[0].id, breakfast.itemId);
    assert.equal(await removePlanItem({ planId: dated.id, itemId: walk.itemId, expectedRevision: 8, actor }, applicationPool), 9);
    itemPlan = await getHolidayPlan(dated.id, applicationPool);
    assert.equal(itemPlan?.days[0].items.length, 0);
    assert.deepEqual(itemPlan?.revisions.slice(-4).map(entry=>entry.action), ['item_updated','item_moved','item_moved','item_removed']);
    assert.equal(await setPlanItemGuideReference({ planId: dated.id, itemId: breakfast.itemId, localGuideEntryId: guideIds.kendalcastle, expectedRevision: 9, actor }, applicationPool), 10);
    itemPlan=await getHolidayPlan(dated.id,applicationPool);
    assert.equal(itemPlan?.days[1].items[0].localGuideSlug,'kendalcastle');
    assert.equal(itemPlan?.days[1].items[0].title,'Breakfast booking','linking guide content must preserve plan-specific text');
    const copy=await duplicateExamplePlan({planId:dated.id,actor},applicationPool);
    assert.notEqual(copy.id,dated.id); assert.equal(copy.revision,1); assert.equal(copy.publicationStatus,'draft'); assert.equal(copy.visibility,'private');
    assert.deepEqual(copy.days.map(day=>day.position),itemPlan?.days.map(day=>day.position));
    assert.notDeepEqual(copy.days.map(day=>day.id),itemPlan?.days.map(day=>day.id));
    assert.notEqual(copy.days[1].items[0].id,breakfast.itemId); assert.equal(copy.days[1].items[0].localGuideSlug,'kendalcastle');
    assert.equal(copy.revisions[0].action,'plan_duplicated'); assert.equal(copy.revisions[0].changes.sourcePlanId,dated.id);
    await updatePlanDay({planId:copy.id,dayId:copy.days[0].id,expectedRevision:1,title:'Independent copied day',date:'2026-09-12',actor},applicationPool);
    itemPlan=await getHolidayPlan(dated.id,applicationPool); assert.equal(itemPlan?.days[0].title,'Arrival day');
    const countBeforeFailure=await applicationPool.query('SELECT count(*)::int count FROM holiday_plans');
    await assert.rejects(duplicateExamplePlan({planId:dated.id,actor:{type:'administrator',adminUserId:'999999999'}},applicationPool),/foreign key constraint/);
    const countAfterFailure=await applicationPool.query('SELECT count(*)::int count FROM holiday_plans');
    assert.equal(countAfterFailure.rows[0].count,countBeforeFailure.rows[0].count,'failed duplication must leave no partial plan');
    assert.equal(await setPlanItemGuideReference({ planId: dated.id, itemId: breakfast.itemId, localGuideEntryId: null, expectedRevision: 10, actor }, applicationPool), 11);
    itemPlan=await getHolidayPlan(dated.id,applicationPool);
    assert.equal(itemPlan?.days[1].items[0].localGuideSlug,null);
    assert.equal(itemPlan?.days[1].items[0].title,'Breakfast booking','detaching must preserve plan-specific text');
    await assert.rejects(
      updateExamplePlan({
        planId: dated.id, expectedRevision: 11, title: 'Broken range',
        startsOn: '2026-09-13', endsOn: '2026-09-14', actor,
      }, applicationPool),
      (error: unknown) => error instanceof PlannerError && error.code === 'VALIDATION_ERROR',
    );

    await assert.rejects(
      applicationPool.query(
        `INSERT INTO holiday_plans (plan_type, title, publication_status, visibility)
         VALUES ('example', 'Invalid public draft', 'draft', 'public')`,
      ),
      /check constraint/,
    );
    await assert.rejects(
      applicationPool.query(
        `INSERT INTO plan_items (plan_day_id, title, item_type, position, status)
         SELECT id, 'Invalid status', 'activity', 99, 'invented' FROM plan_days LIMIT 1`,
      ),
      /check constraint/,
    );

    const publishable = await createExamplePlan({
      title: 'A Perfect Kendal Weekend', description: 'A complete public example.', durationDays: 1, actor,
    }, applicationPool);
    await assert.rejects(
      publishExamplePlan({ planId: publishable.id, expectedRevision: 1, actor }, applicationPool),
      (error: unknown) => error instanceof PlannerError && error.code === 'VALIDATION_ERROR',
    );
    const publicDay = await addPlanDay({ planId: publishable.id, expectedRevision: 1, title: 'Explore Kendal', actor }, applicationPool);
    await assert.rejects(
      publishExamplePlan({ planId: publishable.id, expectedRevision: 2, actor }, applicationPool),
      (error: unknown) => error instanceof PlannerError && error.code === 'VALIDATION_ERROR',
    );
    const publicItem = await addPlanItem({
      planId: publishable.id, dayId: publicDay.dayId, expectedRevision: 2, title: 'Kendal Castle',
      description: 'Walk from Olrig Bank.', itemType: 'activity', localGuideEntryId: guideIds.kendalcastle, actor,
    }, applicationPool);
    const published = await publishExamplePlan({ planId: publishable.id, expectedRevision: 3, actor }, applicationPool);
    assert.equal(published.revision, 4);
    assert.equal(published.publicSlug, 'a-perfect-kendal-weekend');
    assert.equal((await getPublishedExamplePlanBySlug(published.publicSlug, applicationPool))?.id, publishable.id);
    assert.deepEqual((await listPublishedExamplePlans(applicationPool)).map((plan) => plan.id), [publishable.id]);
    await assert.rejects(
      unpublishExamplePlan({ planId: publishable.id, expectedRevision: 3, actor }, applicationPool),
      (error: unknown) => error instanceof PlannerError && error.code === 'STALE_REVISION',
    );
    assert.equal(await unpublishExamplePlan({ planId: publishable.id, expectedRevision: 4, actor }, applicationPool), 5);
    assert.equal(await getPublishedExamplePlanBySlug(published.publicSlug, applicationPool), null);
    assert.equal((await getHolidayPlan(publishable.id, applicationPool))?.revisions.at(-1)?.action, 'plan_unpublished');
    assert.equal(await updateExamplePlan({
      planId: publishable.id, expectedRevision: 5, title: 'Renamed after publication',
      description: 'A complete public example.', durationDays: 1, actor,
    }, applicationPool), 6);
    const republished = await publishExamplePlan({ planId: publishable.id, expectedRevision: 6, actor }, applicationPool);
    assert.equal(republished.publicSlug, published.publicSlug, 'renaming must not change the stable public URL');

    const collision = await createExamplePlan({ title: 'A Perfect Kendal Weekend', durationDays: 1, actor }, applicationPool);
    const collisionDay = await addPlanDay({ planId: collision.id, expectedRevision: 1, title: 'One day', actor }, applicationPool);
    await addPlanItem({ planId: collision.id, dayId: collisionDay.dayId, expectedRevision: 2, title: 'A walk', itemType: 'activity', actor }, applicationPool);
    const collisionPublished = await publishExamplePlan({ planId: collision.id, expectedRevision: 3, actor }, applicationPool);
    assert.equal(collisionPublished.publicSlug, 'a-perfect-kendal-weekend-2');
    assert.equal(await archiveExamplePlan({ planId: collision.id, expectedRevision: 4, actor }, applicationPool), 5);
    assert.equal(await getPublishedExamplePlanBySlug(collisionPublished.publicSlug, applicationPool), null);

    const booking = await applicationPool.query(
      `INSERT INTO provisional_bookings
         (property_id, arrival, departure, guests, guest_name, guest_email, status)
       VALUES ('olrig-bank', '2026-10-10', '2026-10-13', 2, 'Alex Booker',
               'alex@example.invalid', 'confirmed')
       RETURNING id::text, public_id::text`,
    );
    const bookingRow = booking.rows[0];
    await assert.rejects(
      createBookingLinkedPlan({
        bookingReference: bookingRow.public_id,
        actor: { type: 'booker', bookingId: '999999' },
      }, applicationPool),
      (error: unknown) => error instanceof PlannerError && error.code === 'NOT_FOUND',
    );
    const bookingPlan = await createBookingLinkedPlan({
      bookingReference: bookingRow.public_id,
      actor: { type: 'booker', bookingId: bookingRow.id },
    }, applicationPool);
    assert.equal(bookingPlan.planType, 'booking_linked');
    assert.equal(bookingPlan.bookingId, bookingRow.id);
    assert.equal(bookingPlan.title, "Alex Booker's holiday plan");
    assert.equal(bookingPlan.startsOn, '2026-10-10');
    assert.equal(bookingPlan.endsOn, '2026-10-13');
    assert.equal(bookingPlan.durationDays, 4);
    assert.equal(bookingPlan.days.length, 4);
    assert.deepEqual(bookingPlan.days.map(day => day.date), ['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13']);
    assert.equal(bookingPlan.revisions[0].actorType, 'guest');
    assert.equal(bookingPlan.revisions[0].action, 'booking_plan_created');
    assert.equal((await getBookingLinkedPlanByBookingReference(bookingRow.public_id, applicationPool))?.id, bookingPlan.id);
    const owner = await applicationPool.query(
      `SELECT role, participant_type, booking_id::text, display_name
         FROM plan_participants WHERE holiday_plan_id = (SELECT id FROM holiday_plans WHERE public_id = $1)`,
      [bookingPlan.id],
    );
    assert.deepEqual(owner.rows, [{ role: 'owner', participant_type: 'booker', booking_id: bookingRow.id, display_name: 'Alex Booker' }]);
    const plannerActivity = await applicationPool.query(
      `SELECT actor, event_type FROM booking_activity
        WHERE provisional_booking_id = $1 AND event_type = 'holiday_plan_created'`, [bookingRow.id],
    );
    assert.deepEqual(plannerActivity.rows, [{ actor: 'customer', event_type: 'holiday_plan_created' }]);
    await assert.rejects(
      createBookingLinkedPlan({
        bookingReference: bookingRow.public_id,
        actor: { type: 'booker', bookingId: bookingRow.id },
      }, applicationPool),
      (error: unknown) => error instanceof PlannerError && error.code === 'VALIDATION_ERROR',
    );
    await assert.rejects(
      copyPublishedExampleIntoBookingPlan({
        bookingReference: bookingRow.public_id, sourcePlanId: publishable.id, expectedRevision: 1,
        actor: { type: 'booker', bookingId: '999999' },
      }, applicationPool),
      (error: unknown) => error instanceof PlannerError && error.code === 'NOT_FOUND',
    );
    assert.equal(await updatePlanItem({
      planId: publishable.id, itemId: publicItem.itemId, expectedRevision: 7,
      title: 'Source template castle visit', description: 'Independent source wording.',
      itemType: 'activity', status: 'proposed', reservationNote: 'Administrator-only template note',
      visibility: 'participants', actor,
    }, applicationPool), 8);
    const copiedBookingPlan = await copyPublishedExampleIntoBookingPlan({
      bookingReference: bookingRow.public_id, sourcePlanId: publishable.id, expectedRevision: 1,
      actor: { type: 'booker', bookingId: bookingRow.id },
    }, applicationPool);
    assert.equal(copiedBookingPlan.revision, 2);
    assert.equal(copiedBookingPlan.days.length, 4);
    assert.equal(copiedBookingPlan.days[0].date, '2026-10-10');
    assert.notEqual(copiedBookingPlan.days[0].id, publicDay.dayId);
    assert.notEqual(copiedBookingPlan.days[0].items[0].id, publicItem.itemId);
    assert.equal(copiedBookingPlan.days[0].items[0].title, 'Source template castle visit');
    assert.equal(copiedBookingPlan.days[0].items[0].localGuideSlug, 'kendalcastle');
    assert.equal(copiedBookingPlan.days[0].items[0].status, 'idea');
    assert.equal(copiedBookingPlan.days[0].items[0].visibility, 'participants');
    assert.equal(copiedBookingPlan.days[0].items[0].reservationNote, null);
    assert.equal(copiedBookingPlan.revisions.at(-1)?.action, 'example_plan_copied');
    await assert.rejects(
      copyPublishedExampleIntoBookingPlan({
        bookingReference: bookingRow.public_id, sourcePlanId: publishable.id, expectedRevision: 2,
        actor: { type: 'booker', bookingId: bookingRow.id },
      }, applicationPool),
      (error: unknown) => error instanceof PlannerError && error.code === 'VALIDATION_ERROR',
    );
    assert.equal(await updatePlanItem({
      planId: publishable.id, itemId: publicItem.itemId, expectedRevision: 8,
      title: 'Source changed later', itemType: 'activity', status: 'proposed', visibility: 'participants', actor,
    }, applicationPool), 9);
    assert.equal((await getBookingLinkedPlanByBookingReference(bookingRow.public_id, applicationPool))?.days[0].items[0].title,
      'Source template castle visit', 'the booking copy must remain independent');
    const bookerActor = { type: 'booker' as const, bookingId: bookingRow.id };
    assert.equal(await updateBookingLinkedPlan({
      planId: bookingPlan.id, expectedRevision: 2, title: 'Alex and friends in Kendal',
      description: 'Our private working itinerary.', actor: bookerActor,
    }, applicationPool), 3);
    const guestDay = await addPlanDay({
      planId: bookingPlan.id, expectedRevision: 3, title: 'Lake District day',
      summary: 'A flexible day out.', date: '2026-10-11', actor: bookerActor,
    }, applicationPool);
    const guestItem = await addPlanItem({
      planId: bookingPlan.id, dayId: guestDay.dayId, expectedRevision: 4,
      title: 'Walk around the lake', itemType: 'activity', localGuideEntryId: guideIds.fellfoot,
      status: 'idea', actor: bookerActor,
    }, applicationPool);
    assert.equal(await updatePlanItem({
      planId: bookingPlan.id, itemId: guestItem.itemId, expectedRevision: 5,
      title: 'Walk around Fell Foot', itemType: 'activity', status: 'proposed',
      reservationNote: 'Check accessible parking', visibility: 'participants', actor: bookerActor,
    }, applicationPool), 6);
    await assert.rejects(
      updatePlanDay({ planId: bookingPlan.id, dayId: guestDay.dayId, expectedRevision: 6,
        title: 'Intruder edit', date: '2026-10-11', actor: { type: 'booker', bookingId: '999999' } }, applicationPool),
      (error: unknown) => error instanceof PlannerError && error.code === 'NOT_FOUND',
    );
    await assert.rejects(
      addPlanDay({ planId: bookingPlan.id, expectedRevision: 5, title: 'Stale day', date: '2026-10-12', actor: bookerActor }, applicationPool),
      (error: unknown) => error instanceof PlannerError && error.code === 'STALE_REVISION',
    );
    const editedBookingPlan = await getBookingLinkedPlanByBookingReference(bookingRow.public_id, applicationPool);
    assert.equal(editedBookingPlan?.revision, 6);
    assert.equal(editedBookingPlan?.revisions.at(-1)?.actorType, 'guest');
    assert.equal(editedBookingPlan?.revisions.at(-1)?.action, 'item_updated');
    const invitation = await invitePlanParticipant({
      planId: bookingPlan.id, expectedRevision: 6, displayName: 'Sam Editor',
      email: 'sam@example.invalid', role: 'editor', actor: bookerActor,
    }, applicationPool);
    assert.match(invitation.token, /^[A-Za-z0-9_-]{43}$/);
    const storedInvitation = await applicationPool.query(
      `SELECT access_token_hash, invited_email FROM plan_participants WHERE public_id = $1::uuid`,
      [invitation.participantId],
    );
    assert.notEqual(storedInvitation.rows[0].access_token_hash, invitation.token);
    assert.equal(storedInvitation.rows[0].access_token_hash, crypto.createHash('sha256').update(invitation.token).digest('hex'));
    const invitedAccess = await resolveParticipantCredential(invitation.token, true, applicationPool);
    assert.equal(invitedAccess?.role, 'editor');
    assert.equal(invitedAccess?.planId, bookingPlan.id);
    assert.equal((await listPlanParticipants(bookingPlan.id, bookingRow.id, applicationPool)).length, 2);
    const participantActor = { type: 'participant' as const, participantId: String((await applicationPool.query(
      `SELECT id::text FROM plan_participants WHERE public_id = $1::uuid`, [invitation.participantId],
    )).rows[0].id), planId: bookingPlan.id, role: 'editor' as const };
    assert.equal(await updatePlanDay({
      planId: bookingPlan.id, dayId: guestDay.dayId, expectedRevision: 7,
      title: 'Lake District with Sam', date: '2026-10-11', actor: participantActor,
    }, applicationPool), 8);
    assert.equal(await changePlanParticipantRole({
      planId: bookingPlan.id, participantId: invitation.participantId,
      expectedRevision: 8, role: 'viewer', actor: bookerActor,
    }, applicationPool), 9);
    await assert.rejects(
      updateBookingLinkedPlan({ planId: bookingPlan.id, expectedRevision: 9,
        title: 'Stale participant role', actor: participantActor }, applicationPool),
      (error: unknown) => error instanceof PlannerError && error.code === 'NOT_FOUND',
    );
    assert.equal(await revokePlanParticipant({
      planId: bookingPlan.id, participantId: invitation.participantId,
      expectedRevision: 9, actor: bookerActor,
    }, applicationPool), 10);
    assert.equal((await applicationPool.query(
      `SELECT access_token_hash IS NULL AS erased, revoked_at IS NOT NULL AS revoked
         FROM plan_participants WHERE public_id = $1::uuid`, [invitation.participantId],
    )).rows[0].erased, true);
    assert.equal(await resolveParticipantCredential(invitation.token, false, applicationPool), null);
    const collaborativeHistory = (await getHolidayPlan(bookingPlan.id, applicationPool))!.revisions;
    assert.equal(collaborativeHistory.find(entry => entry.action === 'participant_invited')?.actorDisplayName, 'Alex Booker');
    assert.equal(collaborativeHistory.find(entry => entry.action === 'day_updated')?.actorDisplayName, 'Sam Editor');
    assert.equal(collaborativeHistory.find(entry => entry.action === 'day_updated')?.participantId, participantActor.participantId);
    await assert.rejects(
      offerGuideContribution({ planId: bookingPlan.id, itemId: guestItem.itemId, expectedRevision: 10,
        offeredTitle: 'Existing guide item', consent: true, attributionPermitted: false, actor: bookerActor }, applicationPool),
      (error: unknown) => error instanceof PlannerError && error.code === 'VALIDATION_ERROR',
    );
    const recommendation = await addPlanItem({
      planId: bookingPlan.id, dayId: guestDay.dayId, expectedRevision: 10,
      title: 'Quiet riverside picnic', description: 'A peaceful spot beyond the old bridge.',
      itemType: 'activity', locationText: 'River path', status: 'idea', actor: bookerActor,
    }, applicationPool);
    await assert.rejects(
      offerGuideContribution({ planId: bookingPlan.id, itemId: recommendation.itemId, expectedRevision: 11,
        offeredTitle: 'Quiet riverside picnic', consent: false, attributionPermitted: true, actor: bookerActor }, applicationPool),
      (error: unknown) => error instanceof PlannerError && error.code === 'VALIDATION_ERROR',
    );
    const contribution = await offerGuideContribution({
      planId: bookingPlan.id, itemId: recommendation.itemId, expectedRevision: 11,
      offeredTitle: 'Quiet riverside picnic', offeredDescription: 'A peaceful spot beyond the old bridge.',
      offeredLocationText: 'River path', consent: true, attributionPermitted: true, actor: bookerActor,
    }, applicationPool);
    assert.equal(contribution.revision, 12);
    const candidates = await listGuideContributions(bookingPlan.id, applicationPool);
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].offeredTitle, 'Quiet riverside picnic');
    assert.equal(candidates[0].submittedByName, 'Alex Booker');
    assert.equal(candidates[0].attributionName, 'Alex Booker');
    assert.equal(candidates[0].status, 'pending');
    assert.equal(await withdrawGuideContribution({
      planId: bookingPlan.id, candidateId: contribution.candidateId, expectedRevision: 12, actor: bookerActor,
    }, applicationPool), 13);
    assert.equal((await listGuideContributions(bookingPlan.id, applicationPool))[0].status, 'withdrawn');
    const resubmitted = await offerGuideContribution({
      planId: bookingPlan.id, itemId: recommendation.itemId, expectedRevision: 13,
      offeredTitle: 'Quiet riverside picnic', offeredDescription: 'A peaceful spot beyond the old bridge.',
      offeredLocationText: 'River path', consent: true, attributionPermitted: true, actor: bookerActor,
    }, applicationPool);
    const accepted = await moderateGuideContribution({
      candidateId: resubmitted.candidateId, decision: 'accept', reviewedTitle: 'Quiet riverside picnic',
      reviewedDescription: 'A peaceful riverside picnic spot beyond the old bridge.',
      reviewedLocationText: 'River path', resultType: 'new_entry_draft',
      resultGuideSlug: 'quiet-riverside-picnic', moderationNotes: 'Suitable as a new draft.', actor,
    }, applicationPool);
    assert.equal(accepted.revision, 15);
    const acceptedCandidate = (await listGuideContributionModerationQueue(applicationPool)).find(entry => entry.id === resubmitted.candidateId)!;
    assert.equal(acceptedCandidate.status, 'accepted');
    assert.equal(acceptedCandidate.resultType, 'new_entry_draft');
    assert.equal(acceptedCandidate.resultGuideSlug, 'quiet-riverside-picnic');
    assert.ok(acceptedCandidate.resultLocalGuideEntryId);
    assert.ok(acceptedCandidate.resultLocalGuideRevisionId);
    assert.equal(acceptedCandidate.reviewedByName, 'Planner Admin');
    const acceptedDraft=await applicationPool.query(`SELECT e.status,r.actor_type,r.change_summary FROM local_guide_entries e JOIN local_guide_revisions r ON r.id=e.working_revision_id WHERE e.public_id=$1::uuid`,[acceptedCandidate.resultLocalGuideEntryId]);
    assert.equal(acceptedDraft.rows[0].status,'draft');
    assert.equal(acceptedDraft.rows[0].actor_type,'contribution');
    assert.equal(acceptedDraft.rows[0].change_summary.attributionName,'Alex Booker');
    await assert.rejects(
      moderateGuideContribution({ candidateId: resubmitted.candidateId, decision: 'reject',
        moderationNotes: 'Cannot decide twice.', actor }, applicationPool),
      (error: unknown) => error instanceof PlannerError && error.code === 'NOT_FOUND',
    );
    const secondRecommendation = await addPlanItem({
      planId: bookingPlan.id, dayId: guestDay.dayId, expectedRevision: 15,
      title: 'Crowded shortcut', itemType: 'activity', status: 'idea', actor: bookerActor,
    }, applicationPool);
    const rejectedSubmission = await offerGuideContribution({
      planId: bookingPlan.id, itemId: secondRecommendation.itemId, expectedRevision: 16,
      offeredTitle: 'Crowded shortcut', consent: true, attributionPermitted: false, actor: bookerActor,
    }, applicationPool);
    const rejected = await moderateGuideContribution({
      candidateId: rejectedSubmission.candidateId, decision: 'reject',
      moderationNotes: 'Not sufficiently useful for future guests.', actor,
    }, applicationPool);
    assert.equal(rejected.revision, 18);
    const rejectedCandidate = (await listGuideContributionModerationQueue(applicationPool)).find(entry => entry.id === rejectedSubmission.candidateId)!;
    assert.equal(rejectedCandidate.status, 'rejected');
    assert.equal(rejectedCandidate.moderationNotes, 'Not sufficiently useful for future guests.');
    const updateRecommendation = await addPlanItem({
      planId: bookingPlan.id, dayId: guestDay.dayId, expectedRevision: 18,
      title: 'Kendal Castle accessibility note', itemType: 'activity', status: 'idea', actor: bookerActor,
    }, applicationPool);
    const updateSubmission = await offerGuideContribution({
      planId: bookingPlan.id, itemId: updateRecommendation.itemId, expectedRevision: 19,
      offeredTitle: 'Kendal Castle accessibility note', consent: true, attributionPermitted: false, actor: bookerActor,
    }, applicationPool);
    const suggestedUpdate = await moderateGuideContribution({
      candidateId: updateSubmission.candidateId, decision: 'accept',
      reviewedTitle: 'Kendal Castle accessibility note', reviewedDescription: 'Add an accessibility note.',
      resultType: 'suggested_update', resultGuideSlug: 'kendalcastle', actor,
    }, applicationPool);
    assert.equal(suggestedUpdate.revision, 21);
    const updateCandidate = (await listGuideContributionModerationQueue(applicationPool)).find(entry => entry.id === updateSubmission.candidateId)!;
    assert.equal(updateCandidate.resultType, 'suggested_update');
    assert.equal(updateCandidate.resultGuideSlug, 'kendalcastle');
    assert.ok(updateCandidate.resultLocalGuideEntryId);
    assert.ok(updateCandidate.resultLocalGuideRevisionId);
    const updateState=await applicationPool.query(`SELECT status,working_revision_id<>published_revision_id AS private_proposal FROM local_guide_entries WHERE public_id=$1::uuid`,[updateCandidate.resultLocalGuideEntryId]);
    assert.equal(updateState.rows[0].status,'published');
    assert.equal(updateState.rows[0].private_proposal,true);
    await assert.rejects(
      createPlanShareLink({ planId: bookingPlan.id, expectedRevision: 21, expiresDays: 7,
        actor: { type: 'booker', bookingId: '999999' } }, applicationPool),
      (error: unknown) => error instanceof PlannerError && error.code === 'NOT_FOUND',
    );
    const share = await createPlanShareLink({
      planId: bookingPlan.id, expectedRevision: 21, expiresDays: 7, actor: bookerActor,
    }, applicationPool);
    assert.equal(share.revision, 22);
    assert.match(share.token, /^[A-Za-z0-9_-]{43}$/);
    const storedShare = await applicationPool.query(
      `SELECT token_hash, expires_at > NOW() AS active FROM plan_share_links WHERE public_id=$1::uuid`, [share.shareId],
    );
    assert.equal(storedShare.rows[0].token_hash, crypto.createHash('sha256').update(share.token).digest('hex'));
    assert.equal(storedShare.rows[0].active, true);
    assert.equal((await resolvePlanShareCredential(share.token, true, applicationPool))?.planId, bookingPlan.id);
    assert.equal((await listPlanShareLinks(bookingPlan.id, bookingRow.id, applicationPool)).length, 1);
    assert.equal(await revokePlanShareLink({
      planId: bookingPlan.id, shareId: share.shareId, expectedRevision: 22, actor: bookerActor,
    }, applicationPool), 23);
    assert.equal(await resolvePlanShareCredential(share.token, false, applicationPool), null);
    await assert.rejects(
      createPlanAiCapability({ planId: bookingPlan.id, expectedRevision: 23, expiresHours: 25, actor: bookerActor }, applicationPool),
      (error: unknown) => error instanceof PlannerError && error.code === 'VALIDATION_ERROR',
    );
    await assert.rejects(
      createPlanAiCapability({ planId: bookingPlan.id, expectedRevision: 23, expiresHours: 4,
        actor: { type: 'booker', bookingId: '999999' } }, applicationPool),
      (error: unknown) => error instanceof PlannerError && error.code === 'NOT_FOUND',
    );
    const capability = await createPlanAiCapability({
      planId: bookingPlan.id, expectedRevision: 23, expiresHours: 4, actor: bookerActor,
    }, applicationPool);
    assert.equal(capability.revision, 24);
    assert.match(capability.token, /^[A-Za-z0-9_-]{43}$/);
    const storedCapability = await applicationPool.query(
      `SELECT id::text, token_hash, protocol_version, scopes, created_plan_revision,
              expires_at > NOW() AS active
         FROM plan_ai_capabilities WHERE public_id=$1::uuid`, [capability.capabilityId],
    );
    assert.equal(storedCapability.rows[0].token_hash, crypto.createHash('sha256').update(capability.token).digest('hex'));
    assert.equal(storedCapability.rows[0].protocol_version, '1.0');
    assert.deepEqual(storedCapability.rows[0].scopes, ['plan:read', 'proposal:submit']);
    assert.equal(storedCapability.rows[0].created_plan_revision, 23);
    assert.equal(storedCapability.rows[0].active, true);
    const capabilityAccess = await resolveAiCapabilityCredential(capability.token, true, applicationPool);
    assert.equal(capabilityAccess?.planId, bookingPlan.id);
    assert.equal(capabilityAccess?.bookingId, bookingRow.id);
    assert.deepEqual(capabilityAccess?.scopes, ['plan:read', 'proposal:submit']);
    const authorisedRead = await authorizeAiCapabilityRequest(capability.token, 'read', applicationPool);
    assert.equal(authorisedRead.access?.planId, bookingPlan.id);
    assert.equal(authorisedRead.rateLimited, false);
    await applicationPool.query(
      `UPDATE plan_ai_capabilities SET read_window_started_at=NOW(),read_request_count=120 WHERE public_id=$1::uuid`,
      [capability.capabilityId],
    );
    const limitedRead = await authorizeAiCapabilityRequest(capability.token, 'read', applicationPool);
    assert.equal(limitedRead.access, null);
    assert.equal(limitedRead.rateLimited, true);
    assert.deepEqual((await applicationPool.query(
      `SELECT outcome FROM plan_ai_access_events WHERE capability_id=$1 ORDER BY id`, [storedCapability.rows[0].id],
    )).rows, [{ outcome: 'granted' }, { outcome: 'rate_limited' }]);
    assert.equal((await listPlanAiCapabilities(bookingPlan.id, bookerActor, applicationPool)).length, 1);
    assert.equal(await revokePlanAiCapability({
      planId: bookingPlan.id, capabilityId: capability.capabilityId, expectedRevision: 24, actor: bookerActor,
    }, applicationPool), 25);
    assert.equal(await resolveAiCapabilityCredential(capability.token, false, applicationPool), null);
    const revokedCapability = await applicationPool.query(
      `SELECT token_hash IS NULL AS erased, revoked_at IS NOT NULL AS revoked,
              last_accessed_at IS NOT NULL AS accessed
         FROM plan_ai_capabilities WHERE public_id=$1::uuid`, [capability.capabilityId],
    );
    assert.deepEqual(revokedCapability.rows, [{ erased: true, revoked: true, accessed: true }]);

    const proposalBase = {
      format: 'olrig-holiday-plan-proposal', version: '1.0', planId: bookingPlan.id,
      sourceRevision: 25, summary: 'Add two ideas',
      operations: [
        { op: 'add_item', dayId: guestDay.dayId, afterItemId: null,
          item: { title: 'Morning market', type: 'activity', description: 'Browse local stalls.',
            startTime: '09:00', endTime: '10:00', location: 'Kendal', status: 'proposed' } },
        { op: 'add_item', dayId: guestDay.dayId, afterItemId: null,
          item: { title: 'Afternoon walk', type: 'activity', description: 'Walk by the river.',
            startTime: '14:00', endTime: '15:00', location: 'Kendal', status: 'proposed' } },
      ],
    };
    const partialProposal = await storeAiProposal({
      capabilityId: String(storedCapability.rows[0].id), planId: bookingPlan.id, proposal: proposalBase,
    }, applicationPool);
    assert.ok(partialProposal);
    assert.equal(await acceptAiProposal({
      planId: bookingPlan.id, proposalId: partialProposal.proposalId, expectedRevision: 25,
      decision: { action: 'accept', selections: [{ operationIndex: 0 }] }, actor: bookerActor,
    }, applicationPool), 26);
    const acceptedProposal = await applicationPool.query(
      `SELECT p.status, p.decision, pp.role AS decider_role, r.actor_type, r.source, r.participant_id IS NOT NULL AS attributed
         FROM plan_ai_proposals p
         JOIN plan_participants pp ON pp.id=p.decided_by_participant_id
         JOIN plan_revisions r ON r.holiday_plan_id=p.holiday_plan_id AND r.revision=26
        WHERE p.public_id=$1::uuid`, [partialProposal.proposalId],
    );
    assert.equal(acceptedProposal.rows[0].status, 'partially_accepted');
    assert.deepEqual(acceptedProposal.rows[0].decision, { action: 'accept', selections: [{ operationIndex: 0 }] });
    assert.deepEqual({ ...acceptedProposal.rows[0], decision: undefined }, {
      status: 'partially_accepted', decision: undefined, decider_role: 'owner', actor_type: 'external_ai',
      source: 'external_ai_proposal', attributed: true,
    });
    assert.equal((await getHolidayPlan(bookingPlan.id, applicationPool))!.days
      .flatMap(day => day.items).some(item => item.title === 'Morning market'), true);
    assert.equal((await getHolidayPlan(bookingPlan.id, applicationPool))!.days
      .flatMap(day => day.items).some(item => item.title === 'Afternoon walk'), false);
    await assert.rejects(
      acceptAiProposal({ planId: bookingPlan.id, proposalId: partialProposal.proposalId, expectedRevision: 26,
        decision: { action: 'accept', selections: [{ operationIndex: 1 }] }, actor: bookerActor }, applicationPool),
      (error: unknown) => error instanceof PlannerError && error.code === 'NOT_FOUND',
    );

    const rejectedProposal = await storeAiProposal({
      capabilityId: String(storedCapability.rows[0].id), planId: bookingPlan.id,
      proposal: { ...proposalBase, sourceRevision: 26, summary: 'Unwanted walk' },
    }, applicationPool);
    assert.ok(rejectedProposal);
    await rejectAiProposal({ planId: bookingPlan.id, proposalId: rejectedProposal.proposalId,
      reason: 'This does not suit our plans.', actor: bookerActor }, applicationPool);
    const rejectionEvidence = await applicationPool.query(
      `SELECT status, decision, decided_at IS NOT NULL AS decided FROM plan_ai_proposals WHERE public_id=$1::uuid`,
      [rejectedProposal.proposalId],
    );
    assert.deepEqual(rejectionEvidence.rows, [{ status: 'rejected',
      decision: { action: 'reject', reason: 'This does not suit our plans.' }, decided: true }]);
    assert.equal((await getHolidayPlan(bookingPlan.id, applicationPool))!.revision, 26);

    const unsafeProposal = await storeAiProposal({
      capabilityId: String(storedCapability.rows[0].id), planId: bookingPlan.id,
      proposal: { ...proposalBase, sourceRevision: 26, summary: 'Unsafe batch', operations: [
        proposalBase.operations[1],
        { op: 'remove_item', itemId: '10000000-0000-4000-8000-000000000099' },
      ] },
    }, applicationPool);
    assert.ok(unsafeProposal);
    await assert.rejects(
      acceptAiProposal({ planId: bookingPlan.id, proposalId: unsafeProposal.proposalId, expectedRevision: 26,
        decision: { action: 'accept', selections: [{ operationIndex: 0 }, { operationIndex: 1 }] },
        actor: bookerActor }, applicationPool),
      (error: unknown) => error instanceof PlannerError && error.code === 'VALIDATION_ERROR',
    );
    assert.equal((await getHolidayPlan(bookingPlan.id, applicationPool))!.days
      .flatMap(day => day.items).some(item => item.title === 'Afternoon walk'), false);
    assert.deepEqual((await applicationPool.query(
      `SELECT status, decision FROM plan_ai_proposals WHERE public_id=$1::uuid`, [unsafeProposal.proposalId],
    )).rows, [{ status: 'pending', decision: null }]);
    assert.equal((await getHolidayPlan(bookingPlan.id, applicationPool))!.revision, 26);

    const pendingBooking = await applicationPool.query(
      `INSERT INTO provisional_bookings
         (property_id, arrival, departure, guests, guest_name, guest_email, status)
       VALUES ('olrig-bank', '2026-11-10', '2026-11-12', 1, 'Pending Booker',
               'pending@example.invalid', 'pending') RETURNING public_id::text`,
    );
    await assert.rejects(
      createBookingLinkedPlan({
        bookingReference: pendingBooking.rows[0].public_id,
        actor,
      }, applicationPool),
      (error: unknown) => error instanceof PlannerError && error.code === 'VALIDATION_ERROR',
    );

    const adminBooking = await applicationPool.query(
      `INSERT INTO provisional_bookings
         (property_id, arrival, departure, guests, guest_name, guest_email, status)
       VALUES ('olrig-bank', '2026-12-01', '2026-12-04', 2, 'Admin-created Booker',
               'admin-created@example.invalid', 'approved') RETURNING id::text, public_id::text`,
    );
    const adminCreatedPlan = await createBookingLinkedPlan({
      bookingReference: adminBooking.rows[0].public_id, actor,
    }, applicationPool);
    assert.equal(adminCreatedPlan.revisions[0].actorType, 'administrator');
    assert.equal(adminCreatedPlan.revisions[0].adminUserId, actor.adminUserId);
    const adminActivity = await applicationPool.query(
      `SELECT actor, details->>'adminUserId' AS admin_user_id FROM booking_activity
        WHERE provisional_booking_id = $1 AND event_type = 'holiday_plan_created'`, [adminBooking.rows[0].id],
    );
    assert.deepEqual(adminActivity.rows, [{ actor: 'administrator', admin_user_id: actor.adminUserId }]);
    const customCandidate = await addPlanCandidateActivity({
      planId: adminCreatedPlan.id, expectedRevision: 1, title: 'Visit a pottery',
      description: 'Check opening hours.', sourceUrl: 'https://example.com/pottery', actor,
    }, applicationPool);
    const guideCandidate = await addPlanCandidateActivity({
      planId: adminCreatedPlan.id, expectedRevision: customCandidate.revision,
      localGuideEntryId: guideIds.fellfoot, actor,
    }, applicationPool);
    const categoryCandidates = await addPlanGuideCandidates({
      planId: adminCreatedPlan.id, expectedRevision: guideCandidate.revision,
      localGuideEntryIds: [guideIds.fellfoot, guideIds.kendalcastle], actor,
    }, applicationPool);
    assert.equal(categoryCandidates.addedCount, 1);
    assert.equal((await getHolidayPlan(adminCreatedPlan.id, applicationPool))?.candidates.length, 3);
    await assert.rejects(
      addPlanGuideCandidates({
        planId: adminCreatedPlan.id, expectedRevision: categoryCandidates.revision,
        localGuideEntryIds: [guideIds.fellfoot, guideIds.kendalcastle], actor,
      }, applicationPool),
      (error: unknown) => error instanceof PlannerError && error.code === 'VALIDATION_ERROR',
    );
    const reorderedRevision = await movePlanCandidateActivity({
      planId: adminCreatedPlan.id, candidateId: guideCandidate.candidateId,
      expectedRevision: categoryCandidates.revision, direction: 'up', actor,
    }, applicationPool);
    const scheduled = await schedulePlanCandidateActivity({
      planId: adminCreatedPlan.id, candidateId: customCandidate.candidateId,
      dayId: adminCreatedPlan.days[0].id, expectedRevision: reorderedRevision, actor,
    }, applicationPool);
    const scheduledPlan = await getHolidayPlan(adminCreatedPlan.id, applicationPool);
    assert.equal(scheduledPlan?.days[0].items[0].sourceUrl, 'https://example.com/pottery');
    assert.equal(scheduledPlan?.candidates.length, 2);
    const returned = await returnPlanItemToCandidates({
      planId: adminCreatedPlan.id, itemId: scheduled.itemId,
      expectedRevision: scheduled.revision, actor,
    }, applicationPool);
    const returnedPlan = await getHolidayPlan(adminCreatedPlan.id, applicationPool);
    assert.equal(returnedPlan?.candidates.length, 3);
    assert.equal(returnedPlan?.candidates.find(candidate => candidate.id === returned.candidateId)?.sourceUrl,
      'https://example.com/pottery');
    assert.equal(returnedPlan?.days[0].items.length, 0);
    assert.equal(await unpublishExamplePlan({ planId: publishable.id, expectedRevision: 9, actor }, applicationPool), 10);
    await assert.rejects(
      copyPublishedExampleIntoBookingPlan({
        bookingReference: adminBooking.rows[0].public_id, sourcePlanId: publishable.id,
        expectedRevision: returnedPlan!.revision, actor,
      }, applicationPool),
      (error: unknown) => error instanceof PlannerError && error.code === 'NOT_FOUND',
    );
  } finally {
    await applicationPool.end();
    await controlPool.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schema)} CASCADE`);
    await controlPool.end();
  }
});
