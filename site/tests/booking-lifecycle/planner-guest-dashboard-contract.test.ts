import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root=new URL('../../',import.meta.url);
const read=(path:string)=>readFile(new URL(path,root),'utf8');

test('guest planning dashboard defines independent plan families and hash-only access',async()=>{
  const [migration,passwordMigration,repository,page,guestRoute,passwordAccess]=await Promise.all([
    read('db/041_guest_planning_dashboard.sql'),read('db/042_guest_plan_passwords.sql'),read('src/lib/planner/repository.ts'),
    read('src/pages/booking/manage/[token]/index.astro'),read('src/pages/planner/guest/[token].astro'),
    read('src/lib/planner/guest-password.ts'),
  ]);
  assert.match(migration,/plan_role IN \('original', 'guest_copy'\)/);
  assert.match(migration,/holiday_plans_booking_original_idx/);
  assert.match(passwordMigration,/guest_password_hash/);
  assert.match(passwordMigration,/guest_plan_sessions/);
  assert.match(repository,/duplicateBookingPlanForGuest/);
  assert.match(repository,/access_token_hash/);
  assert.match(repository,/replaceGuestPlanCredential/);
  assert.match(repository,/revokeGuestPlanCredential/);
  assert.match(repository,/deleteGuestPlan/);
  assert.match(repository,/holiday_guest_plan_deleted/);
  assert.match(repository,/resetGuestPlanPassword/);
  assert.match(repository,/visibility<>'private'/);
  assert.match(repository,/reservation_note[\s\S]*NULL/);
  assert.match(page,/Planning dashboard/);
  assert.match(page,/Duplicate plan for another guest/);
  assert.match(page,/Copy link \(to send to guest\)/);
  assert.match(page,/button\.remove\(\)/);
  assert.match(page,/Delete guest plan/);
  assert.match(page,/Reset guest password/);
  assert.doesNotMatch(page,/Copy this guest link now/);
  assert.match(guestRoute,/passwordConfirmation/);
  assert.match(guestRoute,/resolveGuestPlanSession/);
  assert.match(passwordAccess,/hashPassword/);
  assert.match(passwordAccess,/httpOnly:true/);
});
