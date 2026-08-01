import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';

const { Pool } = pg;
const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
const scoped = (base: string, schema: string) => { const url = new URL(base); url.searchParams.set('options', `-c search_path=${schema},public`); return url.toString(); };

test('migration backfills arrangements and enforces resource allocation conflicts', async () => {
  assert.ok(databaseUrl, 'Set TEST_DATABASE_URL or DATABASE_URL to run the PostgreSQL integration test.');
  const schema = `resource_events_${process.pid}_${crypto.randomBytes(5).toString('hex')}`;
  const control = new Pool({ connectionString: databaseUrl, max: 1 });
  await control.query(`CREATE SCHEMA ${quote(schema)}`);
  const pool = new Pool({ connectionString: scoped(databaseUrl!, schema), max: 1 });
  try {
    const files = (await readdir(new URL('../../db/', import.meta.url))).filter((name) => name.endsWith('.sql')).sort();
    for (const filename of files.filter((name) => name < '018')) await pool.query(await readFile(new URL(`../../db/${filename}`, import.meta.url), 'utf8'));
    const legacy = await pool.query(
      `INSERT INTO provisional_bookings (property_id,arrival,departure,guests,guest_name,guest_email,status)
       VALUES ('main-house','2026-11-01','2026-11-04',2,'Legacy Booker','legacy@example.test','confirmed') RETURNING id`,
    );
    await pool.query(await readFile(new URL('../../db/018_property_resources_events.sql', import.meta.url), 'utf8'));
    const backfill = await pool.query(
      `SELECT booking_kind,property_ref,booking_arrangement_id,booking_title FROM provisional_bookings WHERE id=$1`, [legacy.rows[0].id],
    );
    assert.deepEqual(backfill.rows[0], { booking_kind:'stay', property_ref:'olrig-bank', booking_arrangement_id:'main-house-stay', booking_title:'Main House stay' });
    assert.equal(Number((await pool.query(`SELECT count(*) FROM booking_resource_allocations WHERE provisional_booking_id=$1 AND resource_id='main-house'`, [legacy.rows[0].id])).rows[0].count), 1);

    const bookingA = (await pool.query(`INSERT INTO provisional_bookings (property_id,property_ref,booking_kind,booking_title,arrival,departure,guests,guest_name,guest_email) VALUES ('whole-property','olrig-bank','event','A','2026-12-01','2026-12-02',1,'A','a@example.test') RETURNING id`)).rows[0].id;
    const bookingB = (await pool.query(`INSERT INTO provisional_bookings (property_id,property_ref,booking_kind,booking_title,arrival,departure,guests,guest_name,guest_email) VALUES ('whole-property','olrig-bank','event','B','2026-12-01','2026-12-02',1,'B','b@example.test') RETURNING id`)).rows[0].id;
    await pool.query(`INSERT INTO booking_resource_allocations (provisional_booking_id,resource_id,start_at,end_at,allocation_state,purpose) VALUES ($1,'grounds','2026-12-01T08:00Z','2026-12-01T12:00Z','hold','event')`, [bookingA]);
    await assert.rejects(
      pool.query(`INSERT INTO booking_resource_allocations (provisional_booking_id,resource_id,start_at,end_at,allocation_state,purpose) VALUES ($1,'grounds','2026-12-01T11:59Z','2026-12-01T13:00Z','hold','event')`, [bookingB]),
      (error: any) => error.code === '23P01',
    );
    await pool.query(`INSERT INTO booking_resource_allocations (provisional_booking_id,resource_id,start_at,end_at,allocation_state,purpose) VALUES ($1,'cottage','2026-12-01T11:00Z','2026-12-01T13:00Z','hold','event')`, [bookingB]);
    await pool.query(`INSERT INTO booking_resource_allocations (provisional_booking_id,resource_id,start_at,end_at,allocation_state,purpose) VALUES ($1,'grounds','2026-12-01T12:00Z','2026-12-01T13:00Z','hold','event')`, [bookingB]);
  } finally {
    await pool.end();
    await control.query(`DROP SCHEMA ${quote(schema)} CASCADE`);
    await control.end();
  }
});

test('migration refuses an unknown legacy booking choice', async () => {
  assert.ok(databaseUrl, 'Set TEST_DATABASE_URL or DATABASE_URL to run the PostgreSQL integration test.');
  const schema = `resource_unmapped_${process.pid}_${crypto.randomBytes(5).toString('hex')}`;
  const control = new Pool({ connectionString: databaseUrl, max: 1 });
  await control.query(`CREATE SCHEMA ${quote(schema)}`);
  const pool = new Pool({ connectionString: scoped(databaseUrl!, schema), max: 1 });
  try {
    const files = (await readdir(new URL('../../db/', import.meta.url))).filter((name) => name.endsWith('.sql')).sort();
    for (const filename of files.filter((name) => name < '018')) await pool.query(await readFile(new URL(`../../db/${filename}`, import.meta.url), 'utf8'));
    await pool.query(`INSERT INTO provisional_bookings (property_id,arrival,departure,guests,guest_name,guest_email) VALUES ('unknown-choice','2027-01-01','2027-01-02',1,'Unknown','unknown@example.test')`);
    await assert.rejects(pool.query(await readFile(new URL('../../db/018_property_resources_events.sql', import.meta.url), 'utf8')), /cannot map/i);
  } finally {
    await pool.end();
    await control.query(`DROP SCHEMA ${quote(schema)} CASCADE`);
    await control.end();
  }
});

