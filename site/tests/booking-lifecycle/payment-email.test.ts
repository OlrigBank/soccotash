import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAdministratorPaymentReportedEmail,
  buildBookerPaymentRejectedEmail,
  buildBookerPaymentVerifiedEmail,
} from '../../src/lib/booking/payment-email.ts';
import type { ProvisionalBookingRequest } from '../../src/lib/booking/repository.ts';

const booking: ProvisionalBookingRequest = {
  reference: '10000000-0000-4000-8000-000000000001',
  customerAccessToken: 'test-booker-token',
  propertyId: 'main-house',
  arrival: '2026-10-01',
  departure: '2026-10-04',
  guests: 8,
  pets: 1,
  name: 'Ada Booker',
  email: 'ada@example.com',
  telephone: '+44 7000 000000',
  message: null,
  status: 'payment_reported',
  pricingCurrency: 'GBP',
  guestTotalPence: 203_500,
  pricingPlanVersion: 1,
  quotedAt: null,
  depositPence: 50_875,
  depositDueAt: '2026-08-07T12:00:00.000Z',
  balanceDuePence: 152_625,
  balanceDueOn: '2026-08-20',
  createdAt: '2026-07-31T08:00:00.000Z',
  latestOfferTotalPence: 203_500,
  latestOfferCurrency: 'GBP',
  latestOfferSentAt: '2026-07-31T08:30:00.000Z',
  unreadMessageCount: 0,
};

test('payment report email tells administrators to verify the declared deposit', () => {
  const original = process.env.BOOKING_ADMIN_EMAIL;
  process.env.BOOKING_ADMIN_EMAIL = 'primary@example.com, second@example.com';
  try {
    const email = buildAdministratorPaymentReportedEmail({
      booking,
      propertyName: 'Olrig Bank',
      adminUrl: 'https://example.com/admin/payment',
    });
    assert.equal(email.to, 'primary@example.com');
    assert.deepEqual(email.bcc, ['second@example.com']);
    assert.match(email.subject, /Payment reported — verification required/);
    assert.match(email.text, /deposit of £508\.75/);
    assert.match(email.text, /not proof of receipt/i);
    assert.match(email.text, /https:\/\/example\.com\/admin\/payment/);
  } finally {
    if (original === undefined) delete process.env.BOOKING_ADMIN_EMAIL;
    else process.env.BOOKING_ADMIN_EMAIL = original;
  }
});

test('verified payment email confirms the booking to the Booker', () => {
  const email = buildBookerPaymentVerifiedEmail({
    booking: { ...booking, status: 'confirmed' },
    propertyName: 'Olrig Bank',
    manageUrl: 'https://example.com/booking/manage/token',
  });
  assert.equal(email.to, 'ada@example.com');
  assert.match(email.subject, /Booking confirmed/);
  assert.match(email.text, /verified your deposit of £508\.75/);
  assert.match(email.text, /now confirmed/);
  assert.match(email.text, /https:\/\/example\.com\/booking\/manage\/token/);
});

test('rejected payment email preserves the reason and next action', () => {
  const email = buildBookerPaymentRejectedEmail({
    booking: { ...booking, status: 'payment_pending' },
    propertyName: 'Olrig Bank',
    reason: 'The amount <does not> match.',
    manageUrl: 'https://example.com/booking/manage/token',
  });
  assert.equal(email.to, 'ada@example.com');
  assert.match(email.subject, /Action required/);
  assert.match(email.text, /Reason: The amount <does not> match\./);
  assert.match(email.text, /returned to payment required/);
  assert.match(email.html, /The amount &lt;does not&gt; match\./);
});
