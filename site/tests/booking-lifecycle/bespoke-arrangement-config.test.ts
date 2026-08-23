import assert from 'node:assert/strict';
import test from 'node:test';
import { getProperty } from '../../src/lib/booking/config.ts';

test('allows one-night bespoke requests without changing ordinary stay minimums', () => {
  const bespoke = getProperty('bespoke-arrangement');
  assert.equal(bespoke?.name, 'Bespoke stay');
  assert.equal(bespoke?.administratorPriced, true);
  assert.equal(bespoke?.minimumNights, 1);
  assert.equal(getProperty('main-house')?.minimumNights, 2);
  assert.equal(getProperty('cottage')?.minimumNights, 2);
  assert.equal(getProperty('whole-property')?.minimumNights, 2);
});

test('uses the agreed public accommodation names without changing stable identifiers', () => {
  assert.equal(getProperty('main-house')?.name, 'Olrig Bank');
  assert.equal(getProperty('whole-property')?.name, 'Olrig Bank with two additional bedrooms, bathroom and WC');
  assert.equal(getProperty('cottage')?.name, 'The Cottage at Olrig Bank');
});
