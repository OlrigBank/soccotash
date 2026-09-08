import assert from 'node:assert/strict';
import test from 'node:test';
import { nightIsBlocked, rangeIsBlocked } from '../../src/lib/booking/booking-panel.ts';

const blocks = [{ startsOn: '2026-10-24', endsOn: '2026-10-30' }];

test('blocked nights exclude checkout, allowing a new arrival on the outgoing departure day', () => {
  assert.equal(nightIsBlocked(blocks, '2026-10-23'), false);
  assert.equal(nightIsBlocked(blocks, '2026-10-24'), true);
  assert.equal(nightIsBlocked(blocks, '2026-10-29'), true);
  assert.equal(nightIsBlocked(blocks, '2026-10-30'), false);
});

test('a boundary departure is allowed while a stay crossing occupied nights is rejected', () => {
  assert.equal(rangeIsBlocked(blocks, '2026-10-22', '2026-10-24'), false);
  assert.equal(rangeIsBlocked(blocks, '2026-10-22', '2026-10-25'), true);
  assert.equal(rangeIsBlocked(blocks, '2026-10-22', '2026-11-03'), true);
  assert.equal(rangeIsBlocked(blocks, '2026-10-30', '2026-11-03'), false);
  assert.equal(rangeIsBlocked([], '2026-10-24', '2026-11-03'), false);
});
