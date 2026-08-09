import crypto from 'node:crypto';
import type { AstroCookies } from 'astro';
import { getPool } from '../booking/db.ts';
import { hashPassword, verifyPassword } from '../admin/password.ts';
import { resolveParticipantCredential, type ParticipantAccess } from './participant-access.ts';

export const GUEST_PLAN_SESSION_COOKIE='olrig_guest_plan_session';
const SESSION_DAYS=30;
const digest=(value:string)=>crypto.createHash('sha256').update(value).digest('hex');

export async function guestPasswordIsSet(token:string):Promise<boolean|null>{
  const access=await resolveParticipantCredential(token,false);if(!access)return null;
  const result=await getPool().query(`SELECT guest_password_hash IS NOT NULL AS password_set FROM plan_participants WHERE id=$1`,[access.participantId]);
  return Boolean(result.rows[0]?.password_set);
}

async function createGuestSession(participantId:string,cookies:AstroCookies):Promise<void>{
  const raw=crypto.randomBytes(32).toString('base64url');const expires=new Date(Date.now()+SESSION_DAYS*86400000);
  await getPool().query(`INSERT INTO guest_plan_sessions(participant_id,token_hash,expires_at) VALUES($1,$2,$3)`,[participantId,digest(raw),expires]);
  cookies.set(GUEST_PLAN_SESSION_COOKIE,raw,{httpOnly:true,secure:import.meta.env.PROD,sameSite:'lax',path:'/',expires});
}

export async function setInitialGuestPassword(token:string,password:string,cookies:AstroCookies):Promise<boolean>{
  const access=await resolveParticipantCredential(token,false);if(!access)return false;
  const passwordHash=await hashPassword(password);const result=await getPool().query(`UPDATE plan_participants SET guest_password_hash=$2,guest_password_set_at=NOW()
    WHERE id=$1 AND guest_password_hash IS NULL RETURNING id`,[access.participantId,passwordHash]);
  if(!result.rowCount)return false;await createGuestSession(access.participantId,cookies);return true;
}

export async function signInGuestPlan(token:string,password:string,cookies:AstroCookies):Promise<boolean>{
  const access=await resolveParticipantCredential(token,false);if(!access)return false;
  const result=await getPool().query(`SELECT guest_password_hash FROM plan_participants WHERE id=$1`,[access.participantId]);
  if(!result.rows[0]?.guest_password_hash||!await verifyPassword(password,result.rows[0].guest_password_hash))return false;
  await createGuestSession(access.participantId,cookies);return true;
}

export async function resolveGuestPlanSession(token:string,cookies:AstroCookies,recordUse=false):Promise<ParticipantAccess|null>{
  const raw=cookies.get(GUEST_PLAN_SESSION_COOKIE)?.value;if(!raw)return null;
  const access=await resolveParticipantCredential(token,false);if(!access)return null;
  const result=await getPool().query(`SELECT s.id FROM guest_plan_sessions s JOIN plan_participants pp ON pp.id=s.participant_id
    WHERE s.participant_id=$1 AND s.token_hash=$2 AND s.expires_at>NOW() AND pp.guest_password_hash IS NOT NULL`,[access.participantId,digest(raw)]);
  if(!result.rowCount)return null;
  if(recordUse){await getPool().query('UPDATE guest_plan_sessions SET last_used_at=NOW() WHERE id=$1',[result.rows[0].id]);await resolveParticipantCredential(token,true)}
  return access;
}
