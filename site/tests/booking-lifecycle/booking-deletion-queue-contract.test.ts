import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = async (path: string) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('booking removal is a reversible deletion mark, not an ordinary hard delete', async () => {
  const [migration, repository, listPage, detailPage] = await Promise.all([
    source('db/043_booking_deletion_queue.sql'),
    source('src/lib/booking/repository.ts'),
    source('src/pages/admin/bookings/index.astro'),
    source('src/pages/admin/bookings/[reference]/index.astro'),
  ]);

  assert.match(migration, /ADD COLUMN deletion_requested_at TIMESTAMPTZ/);
  assert.match(migration, /ALTER TABLE holiday_plans[\s\S]*deletion_booking_id/);
  assert.match(repository, /export async function markBookingForDeletion/);
  assert.match(repository, /UPDATE holiday_plans SET deletion_requested_at=NOW\(\),deletion_booking_id=\$1 WHERE booking_id=\$1/);
  assert.match(repository, /export async function restoreBookingFromDeletion/);
  assert.doesNotMatch(repository, /export async function deleteProvisionalBookingRequest/);
  assert.match(listPage, /deletionQueue\?'marked':'active'/);
  assert.match(detailPage, /Mark booking for deletion/);
  assert.doesNotMatch(detailPage, /Permanently delete this booking request/);
});

test('marking a booking revokes every private plan access route while preserving lifecycle state', async () => {
  const [repository, bookingAccess, participantAccess, shareAccess, aiAccess] = await Promise.all([
    source('src/lib/booking/repository.ts'),
    source('src/lib/booking/booking-access.ts'),
    source('src/lib/planner/participant-access.ts'),
    source('src/lib/planner/share-access.ts'),
    source('src/lib/planner/ai-capability-access.ts'),
  ]);

  assert.match(repository, /UPDATE plan_participants SET access_token_hash=NULL/);
  assert.match(repository, /DELETE FROM guest_plan_sessions/);
  assert.match(repository, /UPDATE plan_share_links SET revoked_at/);
  assert.match(repository, /UPDATE plan_ai_capabilities SET revoked_at/);
  for (const accessSource of [bookingAccess, participantAccess, shareAccess, aiAccess]) {
    assert.match(accessSource, /deletion_requested_at IS NULL/);
  }
});

test('custom guest activities default to private Local Guide review retention with explicit opt-out', async () => {
  const [migration, planner, bookingApi, participantApi, plannerPage] = await Promise.all([
    source('db/043_booking_deletion_queue.sql'),
    source('src/lib/planner/repository.ts'),
    source('src/pages/api/booking/planner/[token].ts'),
    source('src/pages/api/planner/participant/[token].ts'),
    source('src/pages/booking/manage/[token]/planner/index.astro'),
  ]);

  assert.match(migration, /local_guide_retention_opt_out BOOLEAN NOT NULL DEFAULT FALSE/);
  assert.match(planner, /local-guide-candidate-retention-v2/);
  assert.match(planner, /plan_candidate_activity_id/);
  assert.match(bookingApi, /retainForGuide:input\.retainForGuide===true/);
  assert.match(participantApi, /retainForGuide:input\.retainForGuide===true/);
  assert.match(plannerPage, /doNotSaveForGuide/);
  assert.match(plannerPage, /retainForGuide:!candidateForm\.elements\.doNotSaveForGuide\.checked/);
});
