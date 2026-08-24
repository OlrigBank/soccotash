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
  adults: 4,
  children: 0,
  infants: 0,
  pets: 1,
  name: 'Notification Recipient Test',
  email: 'booker@example.com',
  telephone: '+44 1234 567890',
  telephoneE164: '+441234567890',
  whatsappConsentStatus: 'not_requested',
  whatsappConsentAt: null,
  whatsappConsentWithdrawnAt: null,
  whatsappConsentSource: null,
  whatsappConsentVersion: null,
  whatsappConsentNumberE164: null,
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
  assert.deepEqual(getLifecycleEmailTargets('balance_payment_reported'), ['administrator']);
  assert.deepEqual(getLifecycleEmailTargets('balance_payment_verified'), ['booker']);
  assert.deepEqual(getLifecycleEmailTargets('balance_payment_report_rejected'), ['booker']);
  assert.deepEqual(getLifecycleEmailTargets('booking_cancelled'), ['booker']);
  assert.deepEqual(
    getLifecycleEmailTargets('booking_cancelled_by_booker' as never),
    ['administrator'],
  );
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
    const balanceReported = await deliverBookingLifecycleEmail({
      event: 'balance_payment_reported', booking, propertyName: 'Olrig Bank',
      adminUrl: 'https://development.example/admin/bookings/reference/payment/',
      paymentStage: 'balance', paymentAmountPence: 150_000, paymentCurrency: 'GBP',
    });
    const balanceVerified = await deliverBookingLifecycleEmail({
      event: 'balance_payment_verified', booking, propertyName: 'Olrig Bank',
      manageUrl: 'https://development.example/booking/manage/token/',
      paymentStage: 'balance', paymentAmountPence: 150_000, paymentCurrency: 'GBP',
    });
    const balanceRejected = await deliverBookingLifecycleEmail({
      event: 'balance_payment_report_rejected', booking, propertyName: 'Olrig Bank',
      manageUrl: 'https://development.example/booking/manage/token/', reason: 'Balance not visible.',
      paymentStage: 'balance', paymentAmountPence: 150_000, paymentCurrency: 'GBP',
    });

    assert.equal(paymentReported.status, 'sent');
    assert.equal(paymentVerified.status, 'sent');
    assert.equal(paymentRejected.status, 'sent');
    assert.equal(bookingCancelled.status, 'sent');
    assert.equal(balanceReported.status, 'sent');
    assert.equal(balanceVerified.status, 'sent');
    assert.equal(balanceRejected.status, 'sent');
    assert.equal(payloads.length, 7);

    assert.deepEqual(payloads[0].to, ['admin-one@example.com']);
    assert.deepEqual(payloads[0].bcc, ['admin-two@example.com']);
    assert.match(String(payloads[0].subject), /Payment reported/);

    for (const payload of [payloads[1], payloads[2], payloads[3], payloads[5], payloads[6]]) {
      assert.deepEqual(payload.to, ['booker@example.com']);
      assert.equal(Object.hasOwn(payload, 'bcc'), false);
    }
    assert.match(String(payloads[1].subject), /booking is confirmed/);
    assert.match(String(payloads[2].text), /transfer reference did not match/);
    assert.match(String(payloads[3].text), /property is unexpectedly unavailable/);
    assert.deepEqual(payloads[4].to, ['admin-one@example.com']);
    assert.deepEqual(payloads[4].bcc, ['admin-two@example.com']);
    assert.match(String(payloads[4].subject), /Balance reported/);
    assert.deepEqual(payloads[5].to, ['booker@example.com']);
    assert.match(String(payloads[5].subject), /fully paid/);
    assert.deepEqual(payloads[6].to, ['booker@example.com']);
    assert.match(String(payloads[6].text), /remains confirmed/);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('returns a failed balance notification outcome instead of throwing into the committed payment transition', async () => {
  const originalFetch = globalThis.fetch;
  const originalEnvironment = {
    EMAIL_PROVIDER: process.env.EMAIL_PROVIDER,
    BOOKING_EMAIL_FROM: process.env.BOOKING_EMAIL_FROM,
    BOOKING_ADMIN_EMAIL: process.env.BOOKING_ADMIN_EMAIL,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
  };
  process.env.EMAIL_PROVIDER = 'resend';
  process.env.BOOKING_EMAIL_FROM = 'Olrig Bank <bookings@olrig-bank.com>';
  process.env.BOOKING_ADMIN_EMAIL = 'admin@example.com';
  process.env.RESEND_API_KEY = 'test-key';
  globalThis.fetch = (async () => ({
    ok: false,
    status: 503,
    text: async () => 'Provider unavailable',
    json: async () => ({ message: 'Provider unavailable' }),
  } as Response)) as typeof fetch;

  try {
    const outcome = await deliverBookingLifecycleEmail({
      event: 'balance_payment_reported',
      booking,
      propertyName: 'Olrig Bank',
      adminUrl: 'https://development.example/admin/bookings/reference/payment/',
      paymentStage: 'balance',
      paymentAmountPence: 150_000,
      paymentCurrency: 'GBP',
    });
    assert.equal(outcome.status, 'failed');
    if (outcome.status === 'failed') assert.match(outcome.error, /503|Provider unavailable/);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
