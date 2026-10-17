import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import pg from 'pg';

test('offline booking creation records the administrator and preserves verified contact ownership', async () => {
  const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
  assert.ok(databaseUrl, 'Set TEST_DATABASE_URL or DATABASE_URL to run the PostgreSQL integration test.');
  const schema = `admin_booking_${process.pid}_${randomBytes(8).toString('hex')}`;
  const control = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  const originalDatabaseUrl = process.env.DATABASE_URL;
  let application: pg.Pool | undefined;
  const hooks = registerHooks({ resolve(specifier, context, nextResolve) {
    try { return nextResolve(specifier, context); }
    catch (error) {
      if (!specifier.startsWith('.') || /\.[a-z0-9]+$/i.test(specifier)) throw error;
      return nextResolve(`${specifier}.ts`, context);
    }
  } });
  try {
    await control.query(`CREATE SCHEMA ${schema}`);
    const url = new URL(databaseUrl);
    url.searchParams.set('options', `-c search_path=${schema},public`);
    process.env.DATABASE_URL = url.toString();
    const migrations = new pg.Pool({ connectionString: url.toString(), max: 1 });
    try {
      const directory = new URL('../../db/', import.meta.url);
      for (const filename of (await readdir(directory)).filter(name => name.endsWith('.sql')).sort()) {
        await migrations.query(await readFile(new URL(filename, directory), 'utf8'));
      }
    } finally { await migrations.end(); }
    const { getPool } = await import('../../src/lib/booking/db.ts');
    const db = application = getPool();
    const administrator = (await db.query("INSERT INTO admin_users(email,display_name,password_hash) VALUES('admin@example.test','Fixture administrator','no-login') RETURNING id")).rows[0].id;
    const { createAdminBooking } = await import('../../src/lib/admin/create-booking.ts');
    const { accountForIdentity, claimBookings } = await import('../../src/lib/booker/accounts.ts');
    const input = new FormData();
    for (const [key, value] of Object.entries({ name: 'Offline Booker', email: ' BOOKER@EXAMPLE.TEST ', propertyId: 'bespoke-arrangement',
      arrival: '2099-01-10', departure: '2099-01-14', adults: '2', children: '0', infants: '0', stage: 'review' })) input.set(key, value);
    const booking = await createAdminBooking(input, administrator);
    const saved = (await db.query('SELECT booker_account_id,booker_claim_channel,booker_claim_identifier,status FROM provisional_bookings WHERE public_id=$1', [booking.reference])).rows[0];
    assert.deepEqual(saved, { booker_account_id: null, booker_claim_channel: 'email', booker_claim_identifier: 'booker@example.test', status: 'pending' });
    assert.equal(booking.sessionToken, undefined);
    assert.equal((await db.query('SELECT actor FROM booking_activity WHERE event_type=\'booking_requested\'')).rows[0].actor, 'administrator');
    const audit = (await db.query("SELECT admin_user_id,details FROM admin_audit_log WHERE action='booking.created_from_request'")).rows[0];
    assert.equal(String(audit.admin_user_id), String(administrator));
    assert.equal(audit.details.bookingReference, booking.reference);
    for (const table of ['booker_accounts', 'booker_identities', 'booker_sessions', 'booker_verification_grants', 'booking_notification_deliveries']) {
      assert.equal(Number((await db.query(`SELECT count(*) FROM ${table}`)).rows[0].count), 0, table);
    }
    // The normal post-verification claim operation links only the matching contact.
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const identity = { channel: 'email' as const, identifier: 'other@example.test' };
      const other = await accountForIdentity(client, identity);
      await claimBookings(client, other, identity);
      assert.equal((await client.query('SELECT booker_account_id FROM provisional_bookings WHERE public_id=$1', [booking.reference])).rows[0].booker_account_id, null);
      const matching = { channel: 'email' as const, identifier: 'booker@example.test' };
      const account = await accountForIdentity(client, matching);
      await claimBookings(client, account, matching);
      assert.equal((await client.query('SELECT booker_account_id FROM provisional_bookings WHERE public_id=$1', [booking.reference])).rows[0].booker_account_id, account);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    // Audit failure rolls the complete booking creation back.
    const before = Number((await db.query('SELECT count(*) FROM provisional_bookings')).rows[0].count);
    await assert.rejects(createAdminBooking(input, '999999999'));
    assert.equal(Number((await db.query('SELECT count(*) FROM provisional_bookings')).rows[0].count), before);
    input.set('email', '');
    await assert.rejects(createAdminBooking(input, administrator), /email address|telephone/);
  } finally {
    if (application) await application.end();
    hooks.deregister();
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = originalDatabaseUrl;
    await control.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await control.end();
  }
});
