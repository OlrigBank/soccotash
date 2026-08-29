import assert from 'node:assert/strict';
import test from 'node:test';
import { handleNotificationFallbackProcessing } from '../../src/pages/api/admin/process-notification-fallbacks.ts';

function request(token: string | null, contentType = 'application/json'): Request {
  const headers: Record<string, string> = { 'content-type': contentType };
  if (token) headers.authorization = `Bearer ${token}`;
  return new Request('https://example.test/api/admin/process-notification-fallbacks/', {
    method: 'POST', headers, body: '{}',
  });
}

test('fallback processor requires the configured maintenance token and JSON', async () => {
  const previous = process.env.CALENDAR_SYNC_TOKEN;
  process.env.CALENDAR_SYNC_TOKEN = 'maintenance-test-token';
  try {
    assert.equal((await handleNotificationFallbackProcessing(request(null), async () => ({ processed: 0, failed: 0 }))).status, 401);
    assert.equal((await handleNotificationFallbackProcessing(request('wrong'), async () => ({ processed: 0, failed: 0 }))).status, 401);
    assert.equal((await handleNotificationFallbackProcessing(request('maintenance-test-token', 'text/plain'), async () => ({ processed: 0, failed: 0 }))).status, 415);
  } finally {
    if (previous === undefined) delete process.env.CALENDAR_SYNC_TOKEN;
    else process.env.CALENDAR_SYNC_TOKEN = previous;
  }
});

test('fallback processor reports completed and failed batches without exposing job data', async () => {
  const previous = process.env.CALENDAR_SYNC_TOKEN;
  process.env.CALENDAR_SYNC_TOKEN = 'maintenance-test-token';
  try {
    const success = await handleNotificationFallbackProcessing(
      request('maintenance-test-token'),
      async (limit) => {
        assert.equal(limit, 20);
        return { processed: 2, failed: 0 };
      },
    );
    assert.equal(success.status, 200);
    assert.deepEqual(Object.keys(await success.json()).sort(), ['completedAt', 'failed', 'ok', 'processed']);

    const retry = await handleNotificationFallbackProcessing(
      request('maintenance-test-token'),
      async () => ({ processed: 1, failed: 1 }),
    );
    assert.equal(retry.status, 503);
  } finally {
    if (previous === undefined) delete process.env.CALENDAR_SYNC_TOKEN;
    else process.env.CALENDAR_SYNC_TOKEN = previous;
  }
});
