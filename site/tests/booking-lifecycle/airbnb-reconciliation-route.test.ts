import assert from 'node:assert/strict';
import test from 'node:test';
import { ALL, POST } from '../../src/pages/api/admin/airbnb/reconciliation/index.ts';

const admin = { id: '1', email: 'admin@example.test', displayName: 'Admin', role: 'administrator' as const };
const context = (request: Request, adminUser: typeof admin | null) => ({ request, locals: { adminUser } }) as never;

test('Airbnb reconciliation endpoint enforces authentication and same origin', async () => {
  const anonymous = await POST(context(new Request('http://localhost/api/admin/airbnb/reconciliation/', { method: 'POST' }), null));
  assert.equal(anonymous.status, 401);
  const crossSite = await POST(context(new Request('http://localhost/api/admin/airbnb/reconciliation/', {
    method: 'POST', headers: { origin: 'https://attacker.example', 'content-type': 'application/json' }, body: '{}',
  }), admin));
  assert.equal(crossSite.status, 403);
});

test('Airbnb reconciliation endpoint requires JSON, explicit confirmation and valid input', async () => {
  const wrongType = await POST(context(new Request('http://localhost/api/admin/airbnb/reconciliation/', { method: 'POST' }), admin));
  assert.equal(wrongType.status, 415);
  const unconfirmed = await POST(context(new Request('http://localhost/api/admin/airbnb/reconciliation/', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ decision: 'rejected' }),
  }), admin));
  assert.equal(unconfirmed.status, 400);
  const invalid = await POST(context(new Request('http://localhost/api/admin/airbnb/reconciliation/', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ candidateId: 'not-a-uuid', decision: 'confirmed', confirmation: true }),
  }), admin));
  assert.equal(invalid.status, 400);
  assert.equal(invalid.headers.get('cache-control'), 'no-store');
});

test('Airbnb reconciliation endpoint rejects non-POST methods', async () => {
  const response = await ALL({} as never);
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'POST');
});
