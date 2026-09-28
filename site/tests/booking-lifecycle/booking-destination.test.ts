import test from 'node:test';
import assert from 'node:assert/strict';
import { bookingDestination, safeBookerReturnPath } from '../../src/lib/booker/booking-destination.ts';
const reference = '12345678-1234-1234-1234-123456789abc';
test('unfinished bookings resume payment while paid and closed bookings open the reservation', () => {
  for (const status of ['pending', 'offered', 'payment_pending']) {
    assert.equal(bookingDestination({ reference, status, hasVerifiedPayment: false }), `/booking/manage/${reference}/payment/`);
    assert.equal(bookingDestination({ reference, status, hasVerifiedPayment: true }), `/booking/manage/${reference}/reservation/`);
  }
  assert.equal(bookingDestination({ reference, status: 'payment_reported', hasVerifiedPayment: false }), `/booking/manage/${reference}/`);
  assert.equal(bookingDestination({ reference, status: 'confirmed', hasVerifiedPayment: true, hasReportedPayment: true }), `/booking/manage/${reference}/`);
  for (const status of ['confirmed', 'cancelled', 'declined', 'expired']) assert.equal(bookingDestination({ reference, status, hasVerifiedPayment: false }), `/booking/manage/${reference}/reservation/`);
});
test('login return paths retain saved edits and reject external or arbitrary destinations', () => {
  const edit = `/book/?booking=${reference}&step=details`;
  assert.equal(safeBookerReturnPath(edit), edit);
  for (const path of ['https://example.com', '//example.com', '/book/?booking=bad&step=details', `${edit}&redirect=https://example.com`, '/admin/', null]) assert.equal(safeBookerReturnPath(path), null);
});
