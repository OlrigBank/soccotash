import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ADMIN_FINAL_CONTACT_REQUIRED_MESSAGE,
  BOOKER_CONTACT_REQUIRED_MESSAGE,
  adminContactUpdateErrorMessage,
  adminContactUpdateStatus,
  bookerContactSubmissionError,
  isActiveBookingStatus,
  resolveAdminTelephoneUpdate,
  validateBookerContact,
} from '../../src/lib/booking/booking-contact.ts';

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

test('gives focused public-submission feedback for missing or malformed contact details', () => {
  assert.equal(
    bookerContactSubmissionError(validateBookerContact({ email: '', telephone: '' })),
    BOOKER_CONTACT_REQUIRED_MESSAGE,
  );
  assert.equal(
    BOOKER_CONTACT_REQUIRED_MESSAGE,
    'Please provide an email address and/or a contact telephone number so that we can provide you with an offer.',
  );
  assert.equal(
    bookerContactSubmissionError(validateBookerContact({ email: 'invalid', telephone: '' })),
    'Please provide a valid email address.',
  );
  assert.equal(
    bookerContactSubmissionError(validateBookerContact({ email: '', telephone: 'invalid' })),
    'Please provide a valid contact telephone number, including the country code.',
  );
  assert.equal(
    bookerContactSubmissionError(validateBookerContact({ email: 'booker@example.com', telephone: '' })),
    null,
  );
});

test('administrator can explicitly remove a saved telephone number', () => {
  assert.equal(resolveAdminTelephoneUpdate('07700 900123', false), '07700 900123');
  assert.equal(resolveAdminTelephoneUpdate('07700 900123', true), '');
});

test('administrator removal is confirmed only after the stored telephone is null', () => {
  assert.equal(adminContactUpdateStatus(true, null), 'telephone_removed');
  assert.equal(adminContactUpdateStatus(true, '+447700900123'), '1');
  assert.equal(adminContactUpdateStatus(false, null), '1');
});

test('legacy terminal bookings are inactive but lifecycle bookings retain contact', () => {
  for (const status of ['declined', 'cancelled', 'expired']) assert.equal(isActiveBookingStatus(status), false);
  for (const status of ['pending', 'offered', 'payment_pending', 'payment_reported', 'confirmed']) assert.equal(isActiveBookingStatus(status), true);
});


test('administrator receives focused feedback when a final contact removal is rejected', () => {
  assert.equal(
    adminContactUpdateErrorMessage('final_contact_required', false),
    ADMIN_FINAL_CONTACT_REQUIRED_MESSAGE,
  );
  assert.equal(
    ADMIN_FINAL_CONTACT_REQUIRED_MESSAGE,
    'An active booking must retain at least one valid Booker contact method.',
  );
  assert.equal(adminContactUpdateErrorMessage('invalid_contact', false), 'Enter a valid email address or telephone number.');
  assert.equal(adminContactUpdateErrorMessage('1', true), '');
  assert.equal(
    adminContactUpdateErrorMessage('1', false),
    'The contact change could not be confirmed in Technical booking activity. No success has been reported.',
  );
});
