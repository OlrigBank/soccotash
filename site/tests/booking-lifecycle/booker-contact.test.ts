import assert from 'node:assert/strict';
import test from 'node:test';
import { isActiveBookingStatus, validateBookerContact } from '../../src/lib/booking/booking-contact.ts';

test('accepts email-only Booker contact', () => {
  assert.deepEqual(validateBookerContact({ email: ' Booker@Example.com ', telephone: '' }), {
    email: 'booker@example.com', telephone: '', telephoneE164: null, valid: true,
  });
});

test('accepts a valid telephone without implying WhatsApp consent', () => {
  assert.deepEqual(validateBookerContact({ email: '', telephone: '07700 900123' }), {
    email: '', telephone: '07700 900123', telephoneE164: '+447700900123', valid: true,
  });
});

test('rejects absent or invalid contact details', () => {
  assert.equal(validateBookerContact({ email: '', telephone: '' }).valid, false);
  assert.equal(validateBookerContact({ email: 'invalid', telephone: 'invalid' }).valid, false);
});

test('legacy terminal bookings are inactive but lifecycle bookings retain contact', () => {
  for (const status of ['declined', 'cancelled', 'expired']) assert.equal(isActiveBookingStatus(status), false);
  for (const status of ['pending', 'offered', 'payment_pending', 'payment_reported', 'confirmed']) assert.equal(isActiveBookingStatus(status), true);
});
