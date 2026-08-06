import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { AI_PLAN_FORMAT, AI_PLAN_VERSION, createAiPlanRepresentationV1 } from '../../src/lib/planner/ai-representation.ts';
import type { HolidayPlan, PlanItem } from '../../src/lib/planner/types.ts';

const ordinaryItem: PlanItem = {
  id: '20000000-0000-4000-8000-000000000002',
  title: 'Walk to Kendal Castle',
  description: 'Suitable for the whole group.',
  itemType: 'activity',
  startTime: '10:00',
  endTime: '12:00',
  locationText: 'Kendal Castle',
  localGuideEntryId: '11111111-1111-4111-8111-111111111111',
  localGuideSlug: 'kendalcastle',
  status: 'proposed',
  position: 20,
  reservationNote: 'Door code 1234',
  visibility: 'participants',
};

const plan: HolidayPlan = {
  id: '10000000-0000-4000-8000-000000000001',
  planType: 'booking_linked',
  bookingId: '987',
  title: 'The Johnson family stay',
  description: 'Private plan description outside the AI contract.',
  publicationStatus: 'draft',
  visibility: 'private',
  publicSlug: null,
  startsOn: '2026-09-12',
  endsOn: '2026-09-19',
  durationDays: null,
  revision: 7,
  archivedAt: null,
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-02T10:00:00.000Z',
  days: [{
    id: '30000000-0000-4000-8000-000000000003',
    date: '2026-09-13',
    title: 'Kendal day',
    summary: 'Explore on foot.',
    position: 20,
    items: [ordinaryItem, {
      ...ordinaryItem,
      id: '40000000-0000-4000-8000-000000000004',
      title: 'Private surprise',
      description: 'Do not disclose.',
      position: 10,
      visibility: 'private',
    }],
  }],
  revisions: [{
    revision: 7,
    actorType: 'guest',
    adminUserId: null,
    participantId: null,
    actorDisplayName: 'Private Guest Name',
    source: 'guest',
    action: 'item_updated',
    summary: 'Private activity evidence.',
    changes: { bookingAccessToken: 'secret' },
    createdAt: '2026-08-02T10:00:00.000Z',
  }],
};

test('serializes a deterministic v1 plan without private booking data', () => {
  const representation = createAiPlanRepresentationV1(plan);

  assert.equal(representation.format, AI_PLAN_FORMAT);
  assert.equal(representation.version, AI_PLAN_VERSION);
  assert.equal(representation.planId, plan.id);
  assert.equal(representation.revision, 7);
  assert.deepEqual(representation.trip, {
    title: 'The Johnson family stay',
    arrival: '2026-09-12',
    departure: '2026-09-19',
    base: 'Olrig Bank, Kendal',
  });
  assert.deepEqual(representation.days[0].items, [{
    id: ordinaryItem.id,
    type: 'activity',
    startTime: '10:00',
    endTime: '12:00',
    title: 'Walk to Kendal Castle',
    status: 'proposed',
    location: 'Kendal Castle',
    notes: 'Suitable for the whole group.',
    localGuide: { slug: 'kendalcastle', path: '/local-guide/kendalcastle/' },
  }]);

  const serialized = JSON.stringify(representation);
  for (const secret of ['987', 'Door code 1234', 'Private surprise', 'Private Guest Name', 'bookingAccessToken']) {
    assert.equal(serialized.includes(secret), false, `${secret} must not enter the restricted representation`);
  }
});

test('rejects plans that are not dated booking-linked plans', () => {
  assert.throws(
    () => createAiPlanRepresentationV1({ ...plan, planType: 'example', bookingId: null }),
    /dated booking-linked plan/,
  );
  assert.throws(
    () => createAiPlanRepresentationV1({ ...plan, startsOn: null }),
    /dated booking-linked plan/,
  );
});

test('publishes a closed versioned JSON Schema for the representation', async () => {
  const schema = JSON.parse(await readFile(new URL('../../src/lib/planner/ai-representation.schema.json', import.meta.url), 'utf8'));
  assert.equal(schema.properties.format.const, AI_PLAN_FORMAT);
  assert.equal(schema.properties.version.const, AI_PLAN_VERSION);
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.$defs.day.additionalProperties, false);
  assert.equal(schema.$defs.item.additionalProperties, false);
  assert.deepEqual(schema.$defs.item.properties.status.enum, ['idea', 'proposed', 'agreed', 'booked', 'completed', 'cancelled']);
  assert.equal(JSON.stringify(schema).includes('reservationNote'), false);
  assert.equal(JSON.stringify(schema).includes('bookingId'), false);
});
