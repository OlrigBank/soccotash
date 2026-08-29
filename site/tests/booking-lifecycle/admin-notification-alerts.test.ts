import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { countNotificationAlerts, listNotificationAlerts } from '../../src/lib/admin/notification-alerts.ts';

test('Administration exposes notification alerts and manual fallback instructions', async () => {
  const [layout, dashboard, page, repository] = await Promise.all([
    readFile(new URL('../../src/layouts/AdminLayout.astro', import.meta.url), 'utf8'),
    readFile(new URL('../../src/pages/admin/index.astro', import.meta.url), 'utf8'),
    readFile(new URL('../../src/pages/admin/alerts/index.astro', import.meta.url), 'utf8'),
    readFile(new URL('../../src/lib/admin/notification-alerts.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(layout, /\/admin\/alerts\//);
  assert.match(dashboard, /countNotificationAlerts/);
  assert.match(dashboard, />Alerts</);
  assert.match(page, /npm run process:notification-fallbacks/);
  assert.match(page, /Completed jobs are not sent twice/i);
  assert.match(page, /Telephone numbers remain masked/i);
  assert.match(page, /process:inbound-whatsapp-replies/);
  assert.match(repository, /inbound_acknowledgement_failed/);
  assert.match(repository, /INTERVAL '15 minutes'/);
  assert.match(repository, /fallback_email_failed/);
  assert.doesNotMatch(page, /recipient_hash|customer_access_token/);
});

test('alert repository maps privacy-safe rows and counts only returned open work', async () => {
  const rows = [{
    kind: 'fallback_pending', eventType: 'booking_offer_available',
    bookingReference: '00000000-0000-4000-8000-000000000001', recipientMasked: '+44***123',
    status: 'pending', attempts: '1', occurredAt: new Date('2026-08-29T12:00:00Z'),
  }];
  const database = { query: async () => ({ rows }) } as never;
  assert.deepEqual(await listNotificationAlerts(database), [{
    ...rows[0], attempts: 1, occurredAt: '2026-08-29T12:00:00.000Z',
  }]);
  assert.equal(await countNotificationAlerts(database), 1);
});
