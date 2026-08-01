import assert from 'node:assert/strict';
import test from 'node:test';
import { ARRANGEMENTS, arrangementFromLegacyId, isResourceId } from '../../src/lib/booking/arrangements.ts';
import { validateEventRequest, type EventRequestInput } from '../../src/lib/booking/events.ts';

const valid: EventRequestInput = {
  name: 'Example Booker', email: 'booker@example.test', telephone: '+447700900123',
  eventName: 'Garden workshop', eventType: 'workshop', description: 'A practical workshop.',
  setupStartAt: '2026-10-10T08:00:00+01:00', eventStartAt: '2026-10-10T09:00:00+01:00',
  eventEndAt: '2026-10-10T17:00:00+01:00', clearingEndAt: '2026-10-10T19:00:00+01:00',
  daytimeAttendees: 25, overnightGuests: 0, requestedResourceIds: ['grounds'],
  accommodationRequired: false, publicAccess: false, amplifiedMusic: false,
  outsideSuppliers: false, acknowledgement: true,
};

test('maps legacy stay choices to arrangements and their required resources', () => {
  assert.deepEqual(arrangementFromLegacyId('main-house')?.resources, ['main-house']);
  assert.deepEqual(arrangementFromLegacyId('cottage')?.resources, ['cottage']);
  assert.deepEqual(arrangementFromLegacyId('whole-property')?.resources, ['main-house', 'cottage', 'grounds']);
  assert.equal(ARRANGEMENTS.length, 3);
});

test('validates a complete event enquiry without inventing a price or reservation', () => {
  assert.deepEqual(validateEventRequest(valid), { valid: true, value: valid });
});

test('requires ordered setup, event and clearing times', () => {
  const result = validateEventRequest({ ...valid, setupStartAt: valid.eventEndAt });
  assert.equal(result.valid, false);
  if (!result.valid) assert.match(result.errors.join(' '), /Times must run/);
});

test('requires non-negative attendance and an area or clear free-text request', () => {
  const result = validateEventRequest({ ...valid, daytimeAttendees: -1, requestedResourceIds: [] });
  assert.equal(result.valid, false);
  if (!result.valid) {
    assert.match(result.errors.join(' '), /cannot be negative/);
    assert.match(result.errors.join(' '), /at least one area/);
  }
});

test('rejects unknown resource identifiers and requires enquiry acknowledgement', () => {
  assert.equal(isResourceId('ballroom'), false);
  const result = validateEventRequest({ ...valid, requestedResourceIds: ['ballroom'], acknowledgement: false });
  assert.equal(result.valid, false);
  if (!result.valid) assert.match(result.errors.join(' '), /recognised.*Acknowledge/s);
});

