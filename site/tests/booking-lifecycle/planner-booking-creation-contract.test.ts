import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repositoryUrl = new URL('../../src/lib/planner/repository.ts', import.meta.url);
const migrationUrl = new URL('../../db/024_booking_linked_planner_ownership.sql', import.meta.url);
const bookerPageUrl = new URL('../../src/pages/booking/manage/[token]/index.astro', import.meta.url);
const adminPageUrl = new URL('../../src/pages/admin/bookings/[reference]/index.astro', import.meta.url);

test('booking-linked planner creation retains private booking authorization and ownership contracts', async () => {
  const [repository, migration, bookerPage, adminPage] = await Promise.all([
    readFile(repositoryUrl, 'utf8'), readFile(migrationUrl, 'utf8'),
    readFile(bookerPageUrl, 'utf8'), readFile(adminPageUrl, 'utf8'),
  ]);

  assert.match(repository, /createBookingLinkedPlan/, 'creation needs one planner service boundary');
  assert.match(repository, /\['confirmed', 'approved'\]/, 'only confirmed bookings may create a plan');
  assert.match(repository, /input\.actor\.bookingId !== String\(row\.id\)/, 'Booker authorization must bind to the resolved booking');
  assert.match(repository, /BEGIN[\s\S]*plan_participants[\s\S]*recordRevision[\s\S]*booking_activity[\s\S]*COMMIT/, 'plan, owner and audit records must be atomic');
  assert.doesNotMatch(repository, /customer_access_token/, 'planner persistence must not read or copy private credentials');
  assert.match(migration, /role IN \('owner', 'editor', 'contributor', 'viewer'\)/, 'participant roles need an extensible permission vocabulary');
  assert.match(migration, /plan_participants_owner_idx/, 'each plan must have at most one owner');
  assert.match(bookerPage, /resolveBookingAccessCredential\(token/, 'Booker creation must follow private booking access resolution');
  assert.match(bookerPage, /actor: \{ type: 'booker', bookingId: access\.bookingId \}/, 'the resolved booking identity must authorize creation');
  assert.match(bookerPage, /Create my holiday plan/, 'eligible Bookers need a creation entry point');
  assert.match(adminPage, /isSameOrigin\(Astro\.request\)/, 'administrator creation must retain same-origin protection');
  assert.match(adminPage, /Astro\.locals\.adminUser!\.id/, 'administrator creation must retain authenticated attribution');
  assert.match(adminPage, /Create Booker holiday plan/, 'administrators need a booking-level creation entry point');
});
