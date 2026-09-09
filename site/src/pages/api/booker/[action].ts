import type { APIRoute } from 'astro';
import { isSameBookerOrigin } from '../../../lib/booker/origin.ts';
import { getPool } from '../../../lib/booking/db.ts';
import { BookerError, BROWSER_COOKIE, SESSION_COOKIE, browserToken, hashToken, normaliseIdentity, sessionAccount, setSession } from '../../../lib/booker/accounts.ts';
import { validBookingReference } from '../../../lib/booker/context.ts';
import { requestCode, checkCode } from '../../../lib/booker/verification.ts';
export const prerender = false;
const headers = { 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer', 'x-robots-tag': 'noindex, nofollow' };
export const GET: APIRoute = async ({ params, cookies, url }) => {
  if (params.action !== 'session') return new Response(null, { status: 404, headers });
  const accountId = await sessionAccount(cookies);
  const browser = browserToken(cookies, url);
  const identities = accountId ? (await getPool().query('SELECT channel,identifier FROM booker_identities WHERE account_id=$1', [accountId])).rows : [];
  const grants = (await getPool().query('SELECT channel,identifier,expires_at FROM booker_verification_grants WHERE browser_hash=$1 AND consumed_at IS NULL AND expires_at>NOW()', [hashToken(browser)])).rows;
  return Response.json({ signedIn: Boolean(accountId), identities, grants }, { headers });
};
export const POST: APIRoute = async ({ params, request, cookies, url, clientAddress }) => {
  try {
    if (!isSameBookerOrigin(request)) throw new BookerError('Cross-origin request rejected.', 403);
    if (params.action === 'logout') {
      const token = cookies.get(SESSION_COOKIE)?.value;
      if (token) await getPool().query('DELETE FROM booker_sessions WHERE token_hash=$1', [hashToken(token)]);
      const browser = cookies.get(BROWSER_COOKIE)?.value;
      if (browser) {
        await getPool().query('UPDATE booker_verification_grants SET consumed_at=NOW() WHERE browser_hash=$1 AND consumed_at IS NULL', [hashToken(browser)]);
        await getPool().query('UPDATE booker_challenges SET consumed_at=NOW() WHERE browser_hash=$1 AND consumed_at IS NULL', [hashToken(browser)]);
      }
      cookies.delete(SESSION_COOKIE, { path: '/' }); cookies.delete(BROWSER_COOKIE, { path: '/' });
      return new Response(null, { status: 303, headers: { ...headers, location: '/booking/?signedOut=1' } });
    }
    if (!request.headers.get('content-type')?.includes('application/json')) throw new BookerError('JSON request required.', 415);
    const body = await request.json();
    const purpose = body.purpose;
    if (purpose !== 'booking' && purpose !== 'login') throw new BookerError('Invalid verification purpose.');
    const browserHash = hashToken(browserToken(cookies, url));
    if (params.action === 'request-code') {
      const result = await requestCode({ identity: normaliseIdentity(body.channel, body.identifier), purpose, browserHash, ip: clientAddress });
      return Response.json(result, { headers });
    }
    if (params.action === 'verify-code') {
      if (!validBookingReference(String(body.challengeId || '')) || typeof body.code !== 'string' || body.code.length > 12) throw new BookerError('Enter the six-digit code.');
      const result = await checkCode({ id: body.challengeId, code: body.code, purpose, browserHash });
      if (result.sessionToken) setSession(cookies, result.sessionToken, url);
      return Response.json({ verified: result.verified, expiresIn: result.expiresIn, managePath: '/booking/' }, { headers });
    }
    return new Response(null, { status: 404, headers });
  } catch (error) {
    const expected = error instanceof BookerError;
    return Response.json({ error: expected ? error.message : 'Verification is temporarily unavailable. Please try again.', retryAfter: expected ? error.retryAfter : 0 }, {
      status: expected ? error.status : 503, headers: { ...headers, ...(expected && error.retryAfter ? { 'retry-after': String(error.retryAfter) } : {}) },
    });
  }
};
