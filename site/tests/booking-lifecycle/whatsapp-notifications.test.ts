import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { nextDeliveryStatus, type NotificationDeliveryStatus } from '../../src/lib/booking/notification-delivery.ts';
import {
  normaliseWhatsAppTelephone,
  validateWhatsAppConsent,
  WHATSAPP_CONSENT_TEXT,
} from '../../src/lib/booking/whatsapp-phone.ts';
import { getWhatsAppConfiguration, isWhatsAppRecipientAllowed, verifyWhatsAppSignature } from '../../src/lib/booking/whatsapp-provider.ts';
import { getWhatsAppTemplate, whatsappTemplateParameters } from '../../src/lib/booking/whatsapp-templates.ts';

test('normalises international and UK telephone numbers to E.164', () => {
  assert.equal(normaliseWhatsAppTelephone('+44 7700 900123'), '+447700900123');
  assert.equal(normaliseWhatsAppTelephone('0044 (7700) 900123'), '+447700900123');
  assert.equal(normaliseWhatsAppTelephone('07700 900123'), '+447700900123');
  assert.equal(normaliseWhatsAppTelephone('not a number'), null);
});

test('explicit consent requires a valid telephone number', () => {
  assert.throws(() => validateWhatsAppConsent({ telephone: '', requested: true }), /WHATSAPP_TELEPHONE_INVALID/);
  assert.deepEqual(validateWhatsAppConsent({ telephone: '', requested: false }), {
    telephoneE164: null,
    status: 'not_requested',
  });
  assert.match(WHATSAPP_CONSENT_TEXT, /withdraw consent at any time/i);
});

test('verifies Meta webhook signatures without accepting absent credentials', () => {
  const body = '{"object":"whatsapp_business_account"}';
  const secret = 'test-only-app-secret';
  const signature = `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
  assert.equal(verifyWhatsAppSignature(body, signature, secret), true);
  assert.equal(verifyWhatsAppSignature(`${body} `, signature, secret), false);
  assert.equal(verifyWhatsAppSignature(body, null, secret), false);
  const bytes = Buffer.from('{"guest":"Joséphine"}', 'utf8');
  const byteSignature = `sha256=${crypto.createHmac('sha256', secret).update(bytes).digest('hex')}`;
  assert.equal(verifyWhatsAppSignature(bytes, byteSignature, secret), true);
});

test('requires the independent delivery switch in addition to provider credentials', () => {
  const previous = { ...process.env };
  process.env.WHATSAPP_PROVIDER = 'meta';
  process.env.WHATSAPP_GRAPH_API_VERSION = 'v99.0';
  process.env.WHATSAPP_ACCESS_TOKEN = 'test-token';
  process.env.WHATSAPP_PHONE_NUMBER_ID = '123456';
  process.env.WHATSAPP_DELIVERY_ENABLED = 'false';
  assert.equal(getWhatsAppConfiguration().configured, false);
  process.env.WHATSAPP_DELIVERY_ENABLED = 'true';
  assert.equal(getWhatsAppConfiguration().configured, true);
  process.env = previous;
});

test('production rollout recipient guard is independent of delivery configuration', () => {
  const previousAllowlist = process.env.WHATSAPP_RECIPIENT_ALLOWLIST;
  const previousRequired = process.env.WHATSAPP_RECIPIENT_ALLOWLIST_REQUIRED;
  try {
    delete process.env.WHATSAPP_RECIPIENT_ALLOWLIST;
    process.env.WHATSAPP_RECIPIENT_ALLOWLIST_REQUIRED = 'false';
    assert.equal(isWhatsAppRecipientAllowed('+447700900123'), true);

    process.env.WHATSAPP_RECIPIENT_ALLOWLIST_REQUIRED = 'true';
    assert.equal(isWhatsAppRecipientAllowed('+447700900123'), false);

    process.env.WHATSAPP_RECIPIENT_ALLOWLIST = '+44 7700 900123, 07700 900456';
    assert.equal(isWhatsAppRecipientAllowed('+447700900123'), true);
    assert.equal(isWhatsAppRecipientAllowed('+447700900456'), true);
    assert.equal(isWhatsAppRecipientAllowed('+447700900999'), false);
    assert.equal(getWhatsAppConfiguration().recipientAllowlistConfigured, true);
    assert.equal(getWhatsAppConfiguration().recipientAllowlistRequired, true);
  } finally {
    if (previousAllowlist === undefined) delete process.env.WHATSAPP_RECIPIENT_ALLOWLIST;
    else process.env.WHATSAPP_RECIPIENT_ALLOWLIST = previousAllowlist;
    if (previousRequired === undefined) delete process.env.WHATSAPP_RECIPIENT_ALLOWLIST_REQUIRED;
    else process.env.WHATSAPP_RECIPIENT_ALLOWLIST_REQUIRED = previousRequired;
  }
});

test('delivery statuses are monotonic and failures do not erase delivery evidence', () => {
  assert.equal(nextDeliveryStatus('submitted', 'sent'), 'sent');
  assert.equal(nextDeliveryStatus('delivered', 'sent'), 'delivered');
  assert.equal(nextDeliveryStatus('delivered', 'failed'), 'delivered');
  assert.equal(nextDeliveryStatus('sent', 'failed'), 'failed');
  assert.equal(nextDeliveryStatus('failed', 'delivered'), 'delivered');
  assert.equal(nextDeliveryStatus('failed', 'read'), 'read');
  assert.equal(nextDeliveryStatus('read', 'delivered'), 'read');
});

test('delivery status resolution is independent of callback arrival order', () => {
  const forward = (['failed', 'delivered', 'read'] as NotificationDeliveryStatus[]).reduce(
    (current, incoming) => nextDeliveryStatus(current, incoming),
    'submitted' as NotificationDeliveryStatus,
  );
  const reverse = (['read', 'delivered', 'failed'] as NotificationDeliveryStatus[]).reduce(
    (current, incoming) => nextDeliveryStatus(current, incoming),
    'submitted' as NotificationDeliveryStatus,
  );
  assert.equal(forward, 'read');
  assert.equal(reverse, 'read');
});

test('cancellation WhatsApp eligibility remains bound to consent for the current number', async () => {
  const notificationDelivery = await import('../../src/lib/booking/notification-delivery.ts');
  const hasActiveWhatsAppConsentForCurrentNumber = (
    notificationDelivery as Record<string, unknown>
  ).hasActiveWhatsAppConsentForCurrentNumber;
  assert.equal(typeof hasActiveWhatsAppConsentForCurrentNumber, 'function');
  if (typeof hasActiveWhatsAppConsentForCurrentNumber !== 'function') return;
  const consent = {
    whatsappConsentStatus: 'active',
    telephoneE164: '+447700900123',
    whatsappConsentNumberE164: '+447700900123',
  } as const;
  assert.equal(hasActiveWhatsAppConsentForCurrentNumber(consent), true);
  assert.equal(hasActiveWhatsAppConsentForCurrentNumber({
    ...consent,
    telephoneE164: '+447700900456',
  }), false);
  assert.equal(hasActiveWhatsAppConsentForCurrentNumber({
    ...consent,
    whatsappConsentStatus: 'withdrawn',
  }), false);
});

test('versioned templates contain only transactional booking parameters', () => {
  const template = getWhatsAppTemplate('payment_required');
  assert.match(template.version, /^v\d+$/);
  const parameters = whatsappTemplateParameters({
    event: 'payment_required', guestName: 'Example Booker', propertyName: 'Olrig Bank',
    manageUrl: 'https://example.test/booking/manage/test-token/',
  });
  assert.equal(parameters.length, 4);
  assert.match(parameters[1], /payment/i);
});
