import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BOOKING_ACCESS_EXPIRY_ENV,
  DEFAULT_BOOKING_ACCESS_EXPIRY_DAYS,
  bookingAccessExpiresOn,
  bookingAccessState,
  getBookingAccessExpiryDays,
} from '../../src/lib/booking/booking-access-policy.ts';

test('uses the configured expiry period', () => {
  assert.equal(getBookingAccessExpiryDays('90'), 90);
  assert.equal(getBookingAccessExpiryDays('365'), 365);
});

test('falls back to 90 days for missing or invalid configuration', () => {
  assert.equal(getBookingAccessExpiryDays(undefined), DEFAULT_BOOKING_ACCESS_EXPIRY_DAYS);
  assert.equal(getBookingAccessExpiryDays('0'), DEFAULT_BOOKING_ACCESS_EXPIRY_DAYS);
  assert.equal(getBookingAccessExpiryDays('-1'), DEFAULT_BOOKING_ACCESS_EXPIRY_DAYS);
  assert.equal(getBookingAccessExpiryDays('not-a-number'), DEFAULT_BOOKING_ACCESS_EXPIRY_DAYS);
  assert.equal(getBookingAccessExpiryDays('3651'), DEFAULT_BOOKING_ACCESS_EXPIRY_DAYS);
});

test('calculates expiry from the departure date', () => {
  assert.equal(bookingAccessExpiresOn('2026-08-10', 90), '2026-11-08');
});

test('keeps access active through the configured expiry date', () => {
  assert.equal(bookingAccessState({ departure: '2026-08-10', today: '2026-11-08', expiryDays: 90 }), 'active');
  assert.equal(bookingAccessState({ departure: '2026-08-10', today: '2026-11-09', expiryDays: 90 }), 'expired');
});

test('revocation takes precedence over the automatic expiry date', () => {
  assert.equal(bookingAccessState({
    departure: '2027-08-10',
    today: '2026-11-08',
    expiryDays: 90,
    revokedAt: '2026-07-29T17:00:00Z',
  }), 'revoked');
});

test('documents the environment variable name used by deployment configuration', () => {
  assert.equal(BOOKING_ACCESS_EXPIRY_ENV, 'BOOKING_ACCESS_EXPIRY_DAYS_AFTER_DEPARTURE');
});
