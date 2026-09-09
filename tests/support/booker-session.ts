import type { Page } from '@playwright/test';
import type { Client } from 'pg';
import { randomBytes, createHash } from 'node:crypto';
/** Disposable local session for regression suites whose subject is not OTP. */
export async function signInFixtureBooker(page: Page, client: Client, email: string, origin: string) {
  if (!['localhost','127.0.0.1'].includes(new URL(origin).hostname)) throw new Error('Booker fixtures require a local origin.');
  const accountId=(await client.query('INSERT INTO booker_accounts DEFAULT VALUES RETURNING id')).rows[0].id;
  await client.query("INSERT INTO booker_identities(channel,identifier,account_id) VALUES('email',$1,$2)",[email,accountId]);
  await client.query('UPDATE provisional_bookings SET booker_account_id=$2 WHERE guest_email=$1',[email,accountId]);
  const token=randomBytes(32).toString('base64url');
  await client.query("INSERT INTO booker_sessions(token_hash,account_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '1 hour')",[createHash('sha256').update(token).digest('hex'),accountId]);
  await page.context().addCookies([{name:'olrig_booker_session',value:token,url:origin,httpOnly:true,sameSite:'Lax'}]);
  return (await client.query('SELECT public_id::text FROM provisional_bookings WHERE guest_email=$1 LIMIT 1',[email])).rows[0]?.public_id as string | undefined;
}
export async function deleteFixtureBooker(client: Client, email: string) {
  const accounts=await client.query('DELETE FROM booker_identities WHERE identifier=$1 RETURNING account_id',[email]);
  for(const row of accounts.rows)await client.query('DELETE FROM booker_accounts WHERE id=$1',[row.account_id]);
}
