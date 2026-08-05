import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';

import {
  addPlanDay,
  addPlanItem,
  createExamplePlan,
  getHolidayPlan,
} from '../../src/lib/planner/repository.ts';
import { PlannerError } from '../../src/lib/planner/types.ts';

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
      localGuideSlug: 'kendalcastle',
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
        localGuideSlug: '../private-note',
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
  } finally {
    await applicationPool.end();
    await controlPool.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schema)} CASCADE`);
    await controlPool.end();
  }
});
