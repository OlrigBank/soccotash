import crypto from 'node:crypto';
import type { Pool } from 'pg';
import { getPool } from '../booking/db.ts';
import { bookingAccessState, getBookingAccessExpiryDays } from '../booking/booking-access-policy.ts';

const pattern=/^[A-Za-z0-9_-]{43}$/;
const hash=(token:string)=>crypto.createHash('sha256').update(token).digest('hex');

export function createShareCredential():{token:string;hash:string}{const token=crypto.randomBytes(32).toString('base64url');return{token,hash:hash(token)}}

export async function resolvePlanShareCredential(token:string,recordUse=false,database:Pick<Pool,'query'>=getPool()):Promise<{shareId:string;planId:string}|null>{
  if(!pattern.test(token))return null;
  const result=await database.query<any>(
    `SELECT s.id::text AS share_id,hp.public_id::text AS plan_id,pb.departure::text,
            pb.customer_access_token_revoked_at AS booking_access_revoked_at
       FROM plan_share_links s JOIN holiday_plans hp ON hp.id=s.holiday_plan_id
       JOIN provisional_bookings pb ON pb.id=hp.booking_id
      WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>NOW()
        AND hp.plan_type='booking_linked' AND hp.archived_at IS NULL`,[hash(token)]);
  if(!result.rowCount)return null;
  if(bookingAccessState({departure:result.rows[0].departure,revokedAt:result.rows[0].booking_access_revoked_at,expiryDays:getBookingAccessExpiryDays()})!=='active')return null;
  if(recordUse)await database.query('UPDATE plan_share_links SET last_accessed_at=NOW() WHERE id=$1',[result.rows[0].share_id]);
  return{shareId:result.rows[0].share_id,planId:result.rows[0].plan_id};
}
