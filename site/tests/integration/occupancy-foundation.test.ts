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

test('occupancy migration backfills legacy parties and enforces structured counts', async () => {
  assert.ok(databaseUrl, 'Set TEST_DATABASE_URL or DATABASE_URL to run the PostgreSQL integration test.');
  const schema = `occupancy_foundation_${process.pid}_${crypto.randomBytes(6).toString('hex')}`;
  const control = new Pool({ connectionString: databaseUrl, ssl: databaseSsl(), max: 1 });
  const database = new Pool({
    connectionString: scopedDatabaseUrl(databaseUrl!, schema),
    ssl: databaseSsl(),
    max: 1,
  });

  try {
    await control.query(`CREATE SCHEMA ${quoteIdentifier(schema)}`);
    const directory = new URL('../../db/', import.meta.url);
    const files = (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort();
    for (const filename of files.filter((name) => name < '046_booking_party_composition.sql')) {
      await database.query(await readFile(new URL(filename, directory), 'utf8'));
    }

    const legacy = await database.query<{ id: string; pets: number }>(
      `INSERT INTO provisional_bookings
         (property_id, arrival, departure, guests, pets, guest_name, guest_email)
       VALUES ('olrig-bank', CURRENT_DATE + 30, CURRENT_DATE + 32, 5, 2,
               'Legacy party', 'legacy@example.invalid')
       RETURNING id::text, pets`,
    );

    const migration = await readFile(new URL('046_booking_party_composition.sql', directory), 'utf8');
    await database.query(migration);
    await database.query(migration);

    assert.deepEqual(
      (await database.query(
        `SELECT guests, adults, children, infants, pets
           FROM provisional_bookings WHERE id = $1`,
        [legacy.rows[0].id],
      )).rows[0],
      { guests: 5, adults: 5, children: 0, infants: 0, pets: 2 },
    );

    const structured = await database.query(
      `INSERT INTO provisional_bookings
         (property_id, arrival, departure, adults, children, infants, pets,
          guest_name, guest_email)
       VALUES ('olrig-bank', CURRENT_DATE + 40, CURRENT_DATE + 42, 4, 3, 2, 1,
               'Structured party', 'structured@example.invalid')
       RETURNING guests, adults, children, infants, pets`,
    );
    assert.deepEqual(structured.rows[0], {
      guests: 7,
      adults: 4,
      children: 3,
      infants: 2,
      pets: 1,
    });

    const compatible = await database.query(
      `INSERT INTO provisional_bookings
         (property_id, arrival, departure, guests, pets, guest_name, guest_email)
       VALUES ('olrig-bank', CURRENT_DATE + 50, CURRENT_DATE + 52, 3, 0,
               'Compatible party', 'compatible@example.invalid')
       RETURNING guests, adults, children, infants`,
    );
    assert.deepEqual(compatible.rows[0], { guests: 3, adults: 3, children: 0, infants: 0 });

    for (const counts of [
      [0, 0, 0],
      [1, -1, 0],
      [1, 0, -1],
    ]) {
      await assert.rejects(
        database.query(
          `INSERT INTO provisional_bookings
             (property_id, arrival, departure, adults, children, infants,
              guest_name, guest_email)
           VALUES ('olrig-bank', CURRENT_DATE + 60, CURRENT_DATE + 62, $1, $2, $3,
                   'Invalid party', 'invalid@example.invalid')`,
          counts,
        ),
        /provisional_bookings_(adults|children|infants)_check/,
      );
    }
  } finally {
    await database.end();
    await control.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schema)} CASCADE`);
    await control.end();
  }
});
