import assert from 'node:assert/strict';
import test from 'node:test';
import { validateOfferTotal } from '../../src/lib/booking/offer-price.ts';

test('an offer requires a valid positive bottom-line price', () => {
  assert.equal(validateOfferTotal([null]), 'Enter each amount in pounds with no more than two decimal places.');
  assert.equal(validateOfferTotal([0]), 'Enter an agreed price greater than £0 before publishing the offer.');
  assert.equal(validateOfferTotal([-10_000]), 'Enter an agreed price greater than £0 before publishing the offer.');
  assert.equal(validateOfferTotal([10_000, -10_000]), 'Enter an agreed price greater than £0 before publishing the offer.');
  assert.equal(validateOfferTotal([10_000, -2_500]), null);
});
