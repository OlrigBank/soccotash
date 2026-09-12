import type { PoolClient } from 'pg';
import { getPool } from '../booking/db.ts';
import { BookerError, storeSession } from './accounts.ts';
import { normaliseSmsNumber } from './sms.ts';

export type ManagementContext = { accountId: string; sessionHash: string; browserHash: string };
export type MobileOperation = { id: string; account_id: string; action: 'add'|'replace'|'remove'; identifier: string|null; previous_identifier: string|null; email_identifier: string; email_verified_at: Date|null };
export async function lockOperation(client: PoolClient, id: string, context: ManagementContext): Promise<MobileOperation> {
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`mobile-account:${context.accountId}`]);
  const preview = (await client.query('SELECT identifier,previous_identifier FROM booker_mobile_operations WHERE id=$1 AND account_id=$2',[id,context.accountId])).rows[0];
  for (const number of [...new Set([preview?.identifier,preview?.previous_identifier].filter(Boolean))].sort())
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`booker:sms:${number}`]);
  const result = await client.query(`SELECT o.* FROM booker_mobile_operations o
    WHERE o.id=$1 AND o.account_id=$2 AND o.session_hash=$3 AND o.browser_hash=$4
    AND o.consumed_at IS NULL AND o.expires_at>NOW()
    AND EXISTS(SELECT 1 FROM booker_sessions s WHERE s.token_hash=o.session_hash AND s.account_id=o.account_id AND s.expires_at>NOW())
    AND EXISTS(SELECT 1 FROM booker_identities i WHERE i.account_id=o.account_id AND i.channel='email' AND i.identifier=o.email_identifier)
    FOR UPDATE OF o`, [id, context.accountId, context.sessionHash, context.browserHash]);
  if (!result.rowCount) throw new BookerError('This change has expired. Start again from sign-in details.', 403);
  return result.rows[0];
}
export async function beginMobileChange(context: ManagementContext, action: unknown, number: unknown) {
  if (!['add','replace','remove'].includes(String(action))) throw new BookerError('Choose a valid mobile change.');
  const identifier = action === 'remove' ? null : normaliseSmsNumber(typeof number === 'string' && number.length <= 80 ? number : '');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`mobile-account:${context.accountId}`]);
    if (!(await client.query('SELECT 1 FROM booker_sessions WHERE token_hash=$1 AND account_id=$2 AND expires_at>NOW()', [context.sessionHash,context.accountId])).rowCount)
      throw new BookerError('Sign in again to change your mobile number.',401);
    const identities = (await client.query('SELECT channel,identifier FROM booker_identities WHERE account_id=$1 ORDER BY verified_at,identifier', [context.accountId])).rows;
    const email = identities.find(i=>i.channel==='email')?.identifier;
    const previous = identities.find(i=>i.channel==='sms')?.identifier || null;
    if (!email) throw new BookerError('A verified email address is required to manage SMS sign-in.',403);
    if ((action==='add' && previous) || (action!=='add' && !previous) || (identifier && identifier===previous))
      throw new BookerError('Your sign-in details have changed, or this number is already linked. Reload and try again.',409);
    await client.query('UPDATE booker_mobile_operations SET consumed_at=NOW() WHERE account_id=$1 AND consumed_at IS NULL', [context.accountId]);
    const result = await client.query(`INSERT INTO booker_mobile_operations(account_id,session_hash,browser_hash,action,identifier,previous_identifier,email_identifier)
      VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`, [context.accountId,context.sessionHash,context.browserHash,action,identifier,previous,email]);
    await client.query('COMMIT'); return { operationId: result.rows[0].id as string, email };
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}
export async function completeMobileChange(client: PoolClient, operation: MobileOperation) {
  // Serialise with accountForIdentity before changing a number's ownership.
  for (const identifier of [operation.identifier,operation.previous_identifier].filter((v): v is string=>Boolean(v)).sort())
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`booker:sms:${identifier}`]);
  const current = (await client.query("SELECT identifier FROM booker_identities WHERE account_id=$1 AND channel='sms'", [operation.account_id])).rows[0]?.identifier || null;
  if (current !== operation.previous_identifier) throw new BookerError('Your sign-in details have changed. Start again.',409);
  if (operation.identifier && (await client.query("SELECT 1 FROM booker_identities WHERE channel='sms' AND identifier=$1 AND account_id<>$2", [operation.identifier,operation.account_id])).rowCount)
    throw new BookerError('This mobile number cannot be linked. Use a different number.',409);
  if (current) {
    await client.query("DELETE FROM booker_identities WHERE account_id=$1 AND channel='sms'", [operation.account_id]);
    await client.query("UPDATE booker_challenges SET consumed_at=NOW() WHERE channel='sms' AND identifier=$1 AND consumed_at IS NULL", [current]);
    await client.query("UPDATE booker_verification_grants SET consumed_at=NOW() WHERE channel='sms' AND identifier=$1 AND consumed_at IS NULL", [current]);
  }
  if (operation.identifier) await client.query("INSERT INTO booker_identities(channel,identifier,account_id) VALUES('sms',$1,$2)", [operation.identifier,operation.account_id]);
  await client.query('UPDATE booker_mobile_operations SET consumed_at=NOW() WHERE id=$1', [operation.id]);
  if (operation.action !== 'add') {
    await client.query('DELETE FROM booker_sessions WHERE account_id=$1', [operation.account_id]);
    return await storeSession(client, operation.account_id);
  }
  return null;
}
