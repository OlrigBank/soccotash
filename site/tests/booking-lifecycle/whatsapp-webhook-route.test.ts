import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import {
  GET,
  WHATSAPP_WEBHOOK_MAX_BYTES,
  handleWhatsAppPost,
  parseWhatsAppStatuses,
  type WhatsAppStatusInput,
} from '../../src/pages/api/webhooks/whatsapp.ts';

const secret = 'webhook-route-test-secret';

function signedRequest(body: Uint8Array | string, signatureBody: Uint8Array | string = body): Request {
  const signature = `sha256=${crypto.createHmac('sha256', secret).update(signatureBody).digest('hex')}`;
  process.env.WHATSAPP_APP_SECRET = secret;
  return new Request('https://example.test/api/webhooks/whatsapp/', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': signature },
    body: typeof body === 'string' ? body : Buffer.from(body),
  });
}

function payload(statuses: unknown[] = []) {
  return {
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ field: 'messages', value: { statuses } }] }],
  };
}

test('GET echoes the Meta challenge only for an exact configured token', async () => {
  const previous = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = 'verify-me';
  try {
    const validUrl = new URL('https://example.test/api/webhooks/whatsapp/?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=challenge-123');
    const valid = await GET({ url: validUrl } as never);
    assert.equal(valid.status, 200);
    assert.equal(await valid.text(), 'challenge-123');
    assert.equal(valid.headers.get('cache-control'), 'no-store');

    const invalidUrl = new URL('https://example.test/api/webhooks/whatsapp/?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=challenge-123');
    assert.equal((await GET({ url: invalidUrl } as never)).status, 403);
  } finally {
    if (previous === undefined) delete process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
    else process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = previous;
  }
});

test('POST verifies the exact request bytes and accepts a valid WhatsApp envelope', async () => {
  const body = Buffer.from(JSON.stringify(payload()) + '\n', 'utf8');
  assert.equal((await handleWhatsAppPost(signedRequest(body))).status, 200);
  assert.equal((await handleWhatsAppPost(signedRequest(body, Buffer.from(body.toString('utf8').trim())))).status, 401);
});

test('POST rejects malformed JSON, an unexpected envelope and oversized input', async () => {
  assert.equal((await handleWhatsAppPost(signedRequest('{'))).status, 400);
  assert.equal((await handleWhatsAppPost(signedRequest(JSON.stringify({ object: 'page', entry: [] })))).status, 400);
  const oversized = new Uint8Array(WHATSAPP_WEBHOOK_MAX_BYTES + 1);
  assert.equal((await handleWhatsAppPost(signedRequest(oversized))).status, 413);
});

test('status callbacks are normalised and processed sequentially in provider timestamp order', async () => {
  const body = JSON.stringify(payload([
    { id: 'wamid.1', status: 'read', timestamp: '30' },
    { id: 'wamid.1', status: 'sent', timestamp: '10' },
    { id: 'wamid.1', status: 'delivered', timestamp: '20' },
    { id: 'wamid.1', status: 'unsupported', timestamp: '40' },
  ]));
  const processed: WhatsAppStatusInput[] = [];
  const response = await handleWhatsAppPost(signedRequest(body), async (input) => {
    processed.push(input);
  });
  assert.equal(response.status, 200);
  assert.deepEqual(processed.map(({ status }) => status), ['sent', 'delivered', 'read']);
  assert.ok(processed.every(({ providerEventKey }) => /^[a-f0-9]{64}$/.test(providerEventKey)));
});

test('parser ignores guest messages while accepting the Meta messages field', () => {
  assert.deepEqual(parseWhatsAppStatuses({
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ field: 'messages', value: { messages: [{ id: 'guest-message' }] } }] }],
  }), []);
});
