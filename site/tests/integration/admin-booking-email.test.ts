import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';

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

test('persists an updated Booker email for a clean booking read', async () => {
  assert.ok(
    databaseUrl,
    'Set TEST_DATABASE_URL or DATABASE_URL to run the PostgreSQL integration test.',
  );

  const schema = `booking_email_${process.pid}_${crypto.randomBytes(6).toString('hex')}`;
  const controlPool = new Pool({ connectionString: databaseUrl, ssl: databaseSsl(), max: 1 });
  const originalDatabaseUrl = process.env.DATABASE_URL;
  let applicationPool: pg.Pool | undefined;
  let observerPool: pg.Pool | undefined;

  try {
    await controlPool.query(`CREATE SCHEMA ${quoteIdentifier(schema)}`);
    const applicationDatabaseUrl = scopedDatabaseUrl(databaseUrl, schema);
    process.env.DATABASE_URL = applicationDatabaseUrl;

    const migrationPool = new Pool({
      connectionString: applicationDatabaseUrl,
      ssl: databaseSsl(),
      max: 1,
    });
    try {
      const migrationDirectory = new URL('../../db/', import.meta.url);
      const migrationFiles = (await readdir(migrationDirectory))
        .filter((filename) => filename.endsWith('.sql'))
        .sort();
      for (const filename of migrationFiles) {
        await migrationPool.query(await readFile(new URL(filename, migrationDirectory), 'utf8'));
      }
    } finally {
      await migrationPool.end();
    }

    const { updateProvisionalBookingEmail } = await import(
      '../../src/lib/booking/booking-contact.ts'
    );
    const { getPool } = await import('../../src/lib/booking/db.ts');
    applicationPool = getPool();

    const inserted = await applicationPool.query(
      `INSERT INTO provisional_bookings (
         property_id, arrival, departure, guests, guest_name, guest_email, status
       )
       VALUES (
         'olrig-bank', CURRENT_DATE + 40, CURRENT_DATE + 43, 2,
         'Booker Email Integration Test', 'original@example.invalid', 'pending'
       )
       RETURNING public_id::text`,
    );
    const reference = String(inserted.rows[0].public_id);

    assert.equal(
      await updateProvisionalBookingEmail(reference, 'olrig.bank@gmail.com'),
      'olrig.bank@gmail.com',
      'the update must return the address PostgreSQL stored',
    );

    observerPool = new Pool({
      connectionString: applicationDatabaseUrl,
      ssl: databaseSsl(),
      max: 1,
    });
    const independentlyRead = await observerPool.query(
      `SELECT guest_email
         FROM provisional_bookings
        WHERE public_id = $1::uuid`,
      [reference],
    );
    assert.equal(
      independentlyRead.rows[0]?.guest_email,
      'olrig.bank@gmail.com',
      'a clean read on a separate connection must see the committed update',
    );
  } finally {
    if (observerPool) await observerPool.end();
    if (applicationPool) await applicationPool.end();
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
    await controlPool.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schema)} CASCADE`);
    await controlPool.end();
  }
});
