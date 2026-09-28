import { randomUUID } from 'node:crypto';

// A local transport stub, never a payment provider or a source of real credentials.
export function fixtureCardProvider(origin) {
  const sessions = new Map();
  const requests = new Map();
  return {
    async fetch(url, options) {
      const target = new URL(String(url));
      if (target.origin !== 'https://api.stripe.com' || options?.method !== 'POST') throw new Error('External requests are disabled.');
      if (target.pathname === '/v1/checkout/sessions') {
        const key = new Headers(options.headers).get('idempotency-key');
        if (requests.has(key)) return Response.json(requests.get(key));
        const body = new URLSearchParams(options.body);
        const id = `cs_fixture_${randomUUID()}`;
        const session = { object: 'checkout.session', id, payment_status: 'paid',
          amount_total: Number(body.get('line_items[0][price_data][unit_amount]')),
          currency: body.get('line_items[0][price_data][currency]'),
          client_reference_id: body.get('client_reference_id'), payment_intent: `pi_fixture_${randomUUID()}` };
        const success = new URL(body.get('success_url'));
        const cancel = new URL(body.get('cancel_url'));
        if (success.origin !== origin || cancel.origin !== origin) throw new Error('Fixture return URLs must be local.');
        sessions.set(id, { session, success: success.href, cancel: cancel.href });
        const result = { id, url: `${origin}/__checkout-preview/${id}` };
        requests.set(key, result);
        return Response.json(result);
      }
      const expired = target.pathname.match(/^\/v1\/checkout\/sessions\/(cs_fixture_[\w-]+)\/expire$/);
      if (expired && sessions.has(expired[1])) return Response.json({ id: expired[1], status: 'expired' });
      throw new Error('Unsupported fixture provider request.');
    },
    handle(request, response) {
      const match = new URL(request.url, origin).pathname.match(/^\/__checkout-preview\/(cs_fixture_[\w-]+)(\/session)?$/);
      if (!match) return false;
      const fixture = sessions.get(match[1]);
      if (!fixture) { response.writeHead(404); response.end(); return true; }
      response.setHeader('Cache-Control', 'no-store');
      if (match[2]) {
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify(fixture.session));
      } else {
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.end(`<!doctype html><html lang="en-GB"><title>Disposable checkout simulation</title><main><h1>Disposable checkout simulation</h1><p>No payment is taken.</p><a href="${fixture.success}">Return to booking</a> <a href="${fixture.cancel}">Cancel checkout</a></main></html>`);
      }
      return true;
    },
  };
}
