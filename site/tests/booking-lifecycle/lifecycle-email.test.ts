import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deliverBookingLifecycleEmail,
  getLifecycleEmailTargets,
} from '../../src/lib/booking/lifecycle-email.ts';
import type { ProvisionalBookingRequest } from '../../src/lib/booking/repository.ts';

const booking: ProvisionalBookingRequest = {
  reference: '11111111-2222-4333-8444-555555555555',
  customerAccessToken: 'customer-token',
  propertyId: 'olrig-bank',
  arrival: '2026-10-01',
  departure: '2026-10-05',
  guests: 4,
  pets: 1,
  name: 'Notification Recipient Test',
  email: 'booker@example.com',
  telephone: '+44 1234 567890',
  message: null,
  status: 'payment_reported',
  pricingCurrency: 'GBP',
  guestTotalPence: 200_000,
  pricingPlanVersion: 1,
  quotedAt: null,
  depositPence: 50_000,
  depositDueAt: '2026-08-08T12:00:00.000Z',
  balanceDuePence: 150_000,
  balanceDueOn: '2026-08-20',
  createdAt: '2026-08-01T12:00:00.000Z',
  latestOfferTotalPence: 200_000,
  latestOfferCurrency: 'GBP',
  latestOfferSentAt: '2026-08-01T11:00:00.000Z',
  unreadMessageCount: 0,
};

test('canonical lifecycle assigns each essential email to the correct recipient type', () => {
  assert.deepEqual(getLifecycleEmailTargets('payment_reported'), ['administrator']);
  assert.deepEqual(getLifecycleEmailTargets('payment_verified_booking_confirmed'), ['booker']);
  assert.deepEqual(getLifecycleEmailTargets('payment_report_rejected'), ['booker']);
  assert.deepEqual(getLifecycleEmailTargets('booking_cancelled'), ['booker']);
});

test('sends payment and cancellation emails to the declared administrator and Booker recipients', async () => {
  const originalFetch = globalThis.fetch;
  const originalEnvironment = {
    EMAIL_PROVIDER: process.env.EMAIL_PROVIDER,
    BOOKING_EMAIL_FROM: process.env.BOOKING_EMAIL_FROM,
    BOOKING_EMAIL_REPLY_TO: process.env.BOOKING_EMAIL_REPLY_TO,
    BOOKING_ADMIN_EMAIL: process.env.BOOKING_ADMIN_EMAIL,
    BOOKING_EMAIL_BCC: process.env.BOOKING_EMAIL_BCC,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
  };
  const payloads: Array<Record<string, unknown>> = [];

  process.env.EMAIL_PROVIDER = 'resend';
  process.env.BOOKING_EMAIL_FROM = 'Olrig Bank <bookings@olrig-bank.com>';
  process.env.BOOKING_EMAIL_REPLY_TO = 'reply@example.com';
  process.env.BOOKING_ADMIN_EMAIL = 'admin-one@example.com, admin-two@example.com';
  process.env.BOOKING_EMAIL_BCC = '';
  process.env.RESEND_API_KEY = 'test-key';
  globalThis.fetch = (async (_input, init) => {
    payloads.push(JSON.parse(String(init?.body || '{}')) as Record<string, unknown>);
    return {
      ok: true,
      status: 200,
      json: async () => ({ id: `message-${payloads.length}` }),
    } as Response;
  }) as typeof fetch;

  try {
    const paymentReported = await deliverBookingLifecycleEmail({
      event: 'payment_reported',
      booking,
      propertyName: 'Olrig Bank',
      adminUrl: 'https://development.example/admin/bookings/reference/payment/',
    });
    const paymentVerified = await deliverBookingLifecycleEmail({
      event: 'payment_verified_booking_confirmed',
      booking,
      propertyName: 'Olrig Bank',
      manageUrl: 'https://development.example/booking/manage/token/',
    });
    const paymentRejected = await deliverBookingLifecycleEmail({
      event: 'payment_report_rejected',
      booking,
      propertyName: 'Olrig Bank',
      manageUrl: 'https://development.example/booking/manage/token/',
      reason: 'The transfer reference did not match.',
    });
    const bookingCancelled = await deliverBookingLifecycleEmail({
      event: 'booking_cancelled',
      booking,
      propertyName: 'Olrig Bank',
      manageUrl: 'https://development.example/booking/manage/token/',
      reason: 'The property is unexpectedly unavailable.',
    });

    assert.equal(paymentReported.status, 'sent');
    assert.equal(paymentVerified.status, 'sent');
    assert.equal(paymentRejected.status, 'sent');
    assert.equal(bookingCancelled.status, 'sent');
    assert.equal(payloads.length, 4);

    assert.deepEqual(payloads[0].to, ['admin-one@example.com']);
    assert.deepEqual(payloads[0].bcc, ['admin-two@example.com']);
    assert.match(String(payloads[0].subject), /Payment reported/);

    for (const payload of payloads.slice(1)) {
      assert.deepEqual(payload.to, ['booker@example.com']);
      assert.equal(Object.hasOwn(payload, 'bcc'), false);
    }
    assert.match(String(payloads[1].subject), /booking is confirmed/);
    assert.match(String(payloads[2].text), /transfer reference did not match/);
    assert.match(String(payloads[3].text), /property is unexpectedly unavailable/);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
