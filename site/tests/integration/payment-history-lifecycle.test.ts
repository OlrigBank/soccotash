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

test('retains every payment attempt through deposit, balance, stale decisions and cancellation', async () => {
  assert.ok(databaseUrl, 'Set TEST_DATABASE_URL or DATABASE_URL to run the PostgreSQL integration test.');

  const schema = `payment_history_${process.pid}_${crypto.randomBytes(6).toString('hex')}`;
  const controlPool = new Pool({ connectionString: databaseUrl, ssl: databaseSsl(), max: 1 });
  const originalDatabaseUrl = process.env.DATABASE_URL;
  let applicationPool: pg.Pool | undefined;

  try {
    await controlPool.query(`CREATE SCHEMA ${quoteIdentifier(schema)}`);
    process.env.DATABASE_URL = scopedDatabaseUrl(databaseUrl, schema);

    const migrationPool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: databaseSsl(), max: 1 });
    try {
      const migrationDirectory = new URL('../../db/', import.meta.url);
      const migrationFiles = (await readdir(migrationDirectory)).filter((name) => name.endsWith('.sql')).sort();
      for (const filename of migrationFiles) {
        await migrationPool.query(await readFile(new URL(filename, migrationDirectory), 'utf8'));
      }
    } finally {
      await migrationPool.end();
    }

    const {
      getBookingPaymentHistory,
      rejectReportedPayment,
      reportManualBankTransfer,
      verifyReportedPayment,
    } = await import('../../src/lib/booking/payment-lifecycle.ts');
    const { cancelBooking } = await import('../../src/lib/booking/cancellation-lifecycle.ts');
    const { getPool } = await import('../../src/lib/booking/db.ts');
    applicationPool = getPool();

    const admin = await applicationPool.query(
      `INSERT INTO admin_users (email, display_name, password_hash)
       VALUES ('payment-admin@example.invalid', 'Payment Test Admin', 'not-used') RETURNING id::text`,
    );
    const adminId = admin.rows[0].id;
    const token = crypto.randomBytes(32).toString('base64url');
    const inserted = await applicationPool.query(
      `INSERT INTO provisional_bookings (
         property_id, arrival, departure, guests, guest_name, guest_email,
         status, customer_access_token, pricing_currency, guest_total_pence,
         deposit_pence, balance_due_pence, balance_due_on
       ) VALUES (
         'olrig-bank', CURRENT_DATE + 90, CURRENT_DATE + 93, 4,
         'Payment History Integration Test', 'booker@example.invalid',
         'payment_pending', $1, 'GBP', 94000, 23500, 70500, CURRENT_DATE + 48
       ) RETURNING id::text, public_id::text`,
      [token],
    );
    const booking = inserted.rows[0];

    assert.equal(await reportManualBankTransfer(token), 'payment_reported');
    assert.equal(await reportManualBankTransfer(token), 'already_reported');
    let history = await getBookingPaymentHistory(booking.public_id);
    const rejectedDepositId = history[0].publicId;
    assert.deepEqual([history[0].stage, history[0].status, history[0].amountPence], ['deposit', 'reported', 23500]);

    assert.equal(
      await rejectReportedPayment(booking.public_id, rejectedDepositId, 'Transfer is not visible.', adminId),
      'rejected',
    );
    assert.equal(await verifyReportedPayment(booking.public_id, rejectedDepositId, adminId), 'transition_not_allowed');
    assert.equal((await applicationPool.query('SELECT status FROM provisional_bookings WHERE id = $1', [booking.id])).rows[0].status, 'payment_pending');

    assert.equal(await reportManualBankTransfer(token), 'payment_reported');
    history = await getBookingPaymentHistory(booking.public_id);
    const verifiedDepositId = history[0].publicId;
    assert.equal(await verifyReportedPayment(booking.public_id, verifiedDepositId, adminId), 'verified');
    assert.equal((await applicationPool.query('SELECT status FROM provisional_bookings WHERE id = $1', [booking.id])).rows[0].status, 'confirmed');

    assert.equal(await reportManualBankTransfer(token), 'payment_reported');
    assert.equal((await applicationPool.query('SELECT status FROM provisional_bookings WHERE id = $1', [booking.id])).rows[0].status, 'confirmed');
    history = await getBookingPaymentHistory(booking.public_id);
    const rejectedBalanceId = history[0].publicId;
    assert.deepEqual([history[0].stage, history[0].status, history[0].amountPence], ['balance', 'reported', 70500]);
    assert.equal(
      await rejectReportedPayment(booking.public_id, rejectedBalanceId, 'Balance reference does not match.', adminId),
      'rejected',
    );
    assert.equal((await applicationPool.query('SELECT status FROM provisional_bookings WHERE id = $1', [booking.id])).rows[0].status, 'confirmed');

    assert.equal(await reportManualBankTransfer(token), 'payment_reported');
    history = await getBookingPaymentHistory(booking.public_id);
    const verifiedBalanceId = history[0].publicId;
    assert.equal(await verifyReportedPayment(booking.public_id, verifiedBalanceId, adminId), 'verified');
    assert.equal(await reportManualBankTransfer(token), 'payment_not_due');

    history = await getBookingPaymentHistory(booking.public_id);
    assert.deepEqual(
      history.map((payment) => `${payment.stage}:${payment.status}`).sort(),
      ['balance:rejected', 'balance:verified', 'deposit:rejected', 'deposit:verified'],
    );
    assert.equal(history.find((payment) => payment.publicId === rejectedDepositId)?.rejectionReason, 'Transfer is not visible.');
    assert.equal(history.find((payment) => payment.publicId === rejectedBalanceId)?.rejectionReason, 'Balance reference does not match.');

    const cancellationToken = crypto.randomBytes(32).toString('base64url');
    const cancellable = await applicationPool.query(
      `INSERT INTO provisional_bookings (
         property_id, arrival, departure, guests, guest_name, guest_email,
         status, customer_access_token, pricing_currency, guest_total_pence,
         deposit_pence, balance_due_pence, balance_due_on
       ) VALUES (
         'olrig-bank', CURRENT_DATE + 120, CURRENT_DATE + 123, 2,
         'Open Balance Cancellation Test', 'cancel@example.invalid',
         'confirmed', $1, 'GBP', 100000, 25000, 75000, CURRENT_DATE + 78
       ) RETURNING id::text, public_id::text`,
      [cancellationToken],
    );
    await applicationPool.query(
      `INSERT INTO booking_payments (
         provisional_booking_id, stage, amount_pence, currency, method,
         status, reported_at, verified_at
       ) VALUES ($1, 'deposit', 25000, 'GBP', 'bank_transfer', 'verified', NOW(), NOW())`,
      [cancellable.rows[0].id],
    );
    assert.equal(await reportManualBankTransfer(cancellationToken), 'payment_reported');
    const openBalance = (await getBookingPaymentHistory(cancellable.rows[0].public_id))[0];
    assert.equal(openBalance.status, 'reported');
    assert.equal(await cancelBooking(cancellable.rows[0].public_id, 'Acceptance test cancellation.'), 'cancelled');
    const cancelledHistory = await getBookingPaymentHistory(cancellable.rows[0].public_id);
    assert.equal(cancelledHistory[0].status, 'cancelled');
    assert.ok(cancelledHistory[0].cancelledAt);
    assert.equal(await verifyReportedPayment(cancellable.rows[0].public_id, openBalance.publicId, adminId), 'transition_not_allowed');
  } finally {
    if (applicationPool) await applicationPool.end();
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
    await controlPool.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schema)} CASCADE`);
    await controlPool.end();
  }
});
