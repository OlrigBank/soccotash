import assert from 'node:assert/strict';
import test from 'node:test';
import { BOOKING_STATUSES } from '../../src/lib/booking/lifecycle.ts';
import {
  BLOCKING_BOOKING_STATUSES,
  DIRECT_BOOKING_STATUSES,
  INACTIVE_BOOKING_STATUSES,
} from '../../src/lib/booking/status-calendar.ts';

test('calendar blocking follows the canonical booking lifecycle', () => {
  const canonicalBlockingStatuses = Object.entries(BOOKING_STATUSES)
    .filter(([, definition]) => definition.blocksDates)
    .map(([status]) => status)
    .sort();

  assert.deepEqual([...BLOCKING_BOOKING_STATUSES].sort(), canonicalBlockingStatuses);
  assert.ok(
    BLOCKING_BOOKING_STATUSES.includes('offer_accepted'),
    'legacy accepted bookings must remain blocking until migrated',
  );
});

test('confirmed-equivalent bookings are direct calendar entries', () => {
  assert.deepEqual([...DIRECT_BOOKING_STATUSES].sort(), ['approved', 'confirmed']);
  assert.ok(DIRECT_BOOKING_STATUSES.every((status) => BLOCKING_BOOKING_STATUSES.includes(status)));
});

test('declined and expired bookings are the default inactive list filter', () => {
  assert.deepEqual([...INACTIVE_BOOKING_STATUSES].sort(), ['declined', 'expired']);
  assert.ok(INACTIVE_BOOKING_STATUSES.every((status) => !BLOCKING_BOOKING_STATUSES.includes(status)));
});
