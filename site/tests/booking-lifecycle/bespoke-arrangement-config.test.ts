import assert from 'node:assert/strict';
import test from 'node:test';
import { getProperty } from '../../src/lib/booking/config.ts';

test('allows one-night bespoke requests without changing ordinary stay minimums', () => {
  const bespoke = getProperty('bespoke-arrangement');
  assert.equal(bespoke?.name, 'Request a bespoke stay');
  assert.equal(bespoke?.administratorPriced, true);
  assert.equal(bespoke?.minimumNights, 1);
  assert.equal(getProperty('main-house')?.minimumNights, 2);
  assert.equal(getProperty('cottage')?.minimumNights, 2);
  assert.equal(getProperty('whole-property')?.minimumNights, 2);
});

test('uses the agreed public accommodation names without changing stable identifiers', () => {
  assert.equal(getProperty('main-house')?.name, 'Olrig Bank (max 8 guests)');
  assert.equal(getProperty('main-house')?.listingSlug, 'olrig-bank');
  assert.equal(getProperty('whole-property')?.name, 'Olrig Bank++ (max 12 guests)');
  assert.equal(getProperty('cottage')?.name, 'Cottage at Olrig Bank (max 4 guests)');
});
