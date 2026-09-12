import type { APIRoute } from 'astro';
import { BookerError, SESSION_COOKIE, browserToken, hashToken, sessionAccount, setSession } from '../../../lib/booker/accounts.ts';
import { beginMobileChange, lockOperation } from '../../../lib/booker/mobile-management.ts';
import { requestCode, checkCode } from '../../../lib/booker/verification.ts';
import { getPool } from '../../../lib/booking/db.ts';
import { validBookingReference } from '../../../lib/booker/context.ts';
import { isSameBookerOrigin } from '../../../lib/booker/origin.ts';
import { requireSms } from '../../../lib/booker/sms.ts';
export const prerender = false;
export const POST: APIRoute = async ({request,cookies,url,clientAddress}) => {
  try {
    if (!isSameBookerOrigin(request)) throw new BookerError('Cross-origin request rejected.',403);
    const accountId = await sessionAccount(cookies);
    if (!accountId) throw new BookerError('Sign in to manage SMS access.',401);
    if (!request.headers.get('content-type')?.includes('application/json')) throw new BookerError('JSON request required.',415);
    const body = await request.json();
    if (!body || typeof body !== 'object') throw new BookerError('Enter a valid request.');
    const context = { accountId, sessionHash: hashToken(cookies.get(SESSION_COOKIE)!.value), browserHash: hashToken(browserToken(cookies,url)) };
    let operationId = body.operationId;
    if (body.step === 'start') {
      if (body.action !== 'remove') requireSms();
      operationId = (await beginMobileChange(context,body.action,body.identifier)).operationId;
    }
    if (!validBookingReference(String(operationId || ''))) throw new BookerError('Start again from sign-in details.');
    const client = await getPool().connect();
    let operation;
    try {
      await client.query('BEGIN'); operation = await lockOperation(client,operationId,context); await client.query('COMMIT');
    } catch(error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    const purpose = operation.email_verified_at ? 'account-sms' : 'account-email';
    if (body.step === 'check') {
      if (!validBookingReference(String(body.challengeId || '')) || typeof body.code !== 'string' || !/^\d{6}$/.test(body.code)) throw new BookerError('Enter the six-digit code.');
      const result = await checkCode({id:body.challengeId,code:body.code,purpose,browserHash:context.browserHash,operationId,management:context});
      if (result.sessionToken) setSession(cookies,result.sessionToken,url);
      return Response.json({verified:true,nextStep:result.nextStep});
    }
    if (!['start','send'].includes(body.step)) throw new BookerError('Choose a valid verification step.');
    const identity = purpose==='account-email' ? {channel:'email' as const,identifier:operation.email_identifier} : {channel:'sms' as const,identifier:operation.identifier!};
    const result = await requestCode({identity,purpose,browserHash:context.browserHash,ip:clientAddress,operationId,management:context});
    return Response.json({...result,operationId,channel:identity.channel});
  } catch(error) {
    const safe = error instanceof BookerError ? error : new BookerError('This change could not be completed. Start again shortly.',503);
    return Response.json({error:safe.message,retryAfter:safe.retryAfter},{status:safe.status,headers:safe.retryAfter ? {'retry-after':String(safe.retryAfter)} : {}});
  }
};
