import assert from 'node:assert/strict';
import test from 'node:test';
import { handleInboundWhatsAppReplyProcessing } from '../../src/pages/api/admin/process-inbound-whatsapp-replies.ts';

function request(token: string, contentType = 'application/json') {
  return new Request('https://example.test/api/admin/process-inbound-whatsapp-replies/', {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': contentType }, body: '{}',
  });
}

test('inbound reply processor is authenticated and reports bounded results', async () => {
  const previous = process.env.CALENDAR_SYNC_TOKEN;
  process.env.CALENDAR_SYNC_TOKEN = 'maintenance-token';
  try {
    assert.equal((await handleInboundWhatsAppReplyProcessing(request('wrong'), async () => ({ processed: 0, failed: 0 }))).status, 401);
    assert.equal((await handleInboundWhatsAppReplyProcessing(request('maintenance-token', 'text/plain'), async () => ({ processed: 0, failed: 0 }))).status, 415);
    let limit = 0;
    const response = await handleInboundWhatsAppReplyProcessing(request('maintenance-token'), async (value) => {
      limit = value || 0;
      return { processed: 2, failed: 0 };
    });
    assert.equal(response.status, 200);
    assert.equal(limit, 20);
    assert.deepEqual({ ...(await response.json()), completedAt: undefined }, { ok: true, processed: 2, failed: 0, completedAt: undefined });
  } finally {
    if (previous === undefined) delete process.env.CALENDAR_SYNC_TOKEN;
    else process.env.CALENDAR_SYNC_TOKEN = previous;
  }
});
