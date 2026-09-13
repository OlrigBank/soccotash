import assert from 'node:assert/strict';
import test from 'node:test';
import { directOfferDecision } from '../../src/lib/booking/direct-offer.ts';

const standard = { propertyId: 'main-house', occupancyOutcome: 'standard', pricingQuote: { result: { eligible: true, guestTotalPence: 120000 } } };
test('priced standard house and cottage stays receive a direct offer', () => {
  for (const propertyId of ['main-house', 'cottage']) assert.deepEqual(directOfferDecision({ ...standard, propertyId }), { automaticOffer: true, reviewReason: null });
});
test('every review exception prevents automatic publication', () => {
  for (const change of [
    { propertyId: 'bespoke-arrangement' }, { propertyId: 'whole-property' }, { propertyId: 'future-property' },
    { administratorPriced: true }, { promoCode: 'SUMMER' }, { occupancyOutcome: 'bespoke' },
    { occupancyOutcome: 'host_decision_required' }, { occupancyOutcome: undefined }, { pricingQuote: null },
    ...[0, -1, NaN, Infinity, 0.5].map(guestTotalPence => ({ pricingQuote: { result: { eligible: true, guestTotalPence } } })),
    { pricingQuote: { result: { eligible: false, guestTotalPence: 120000 } } },
  ]) {
    const decision = directOfferDecision({ ...standard, ...change });
    assert.equal(decision.automaticOffer, false, JSON.stringify(change));
    assert.ok(decision.reviewReason);
  }
  assert.equal(directOfferDecision({ ...standard, promoCode: '  ' }).automaticOffer, true);
});
