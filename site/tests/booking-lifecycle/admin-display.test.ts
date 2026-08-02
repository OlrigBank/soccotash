import assert from 'node:assert/strict';
import test from 'node:test';
import { getAdminPriceDisplayState, shouldShowOfferPublishedNotice } from '../../src/lib/booking/admin-display.ts';

test('the offer-published notice is limited to the offered booking state', () => {
  assert.equal(shouldShowOfferPublishedNotice(true, 'offered'), true);
  assert.equal(shouldShowOfferPublishedNotice(true, 'payment_pending'), false);
  assert.equal(shouldShowOfferPublishedNotice(true, 'payment_reported'), false);
  assert.equal(shouldShowOfferPublishedNotice(true, 'confirmed'), false);
  assert.equal(shouldShowOfferPublishedNotice(false, 'offered'), false);
});

test('the administrator price display follows the accepted offer through payment and confirmation', () => {
  assert.deepEqual(getAdminPriceDisplayState({
    bookingStatus: 'pending', hasRecordedPricing: false, hasPublishedOffer: false, hasAcceptedOffer: false,
  }), { heading: 'Price to be agreed', source: 'none' });
  assert.deepEqual(getAdminPriceDisplayState({
    bookingStatus: 'offered', hasRecordedPricing: false, hasPublishedOffer: true, hasAcceptedOffer: false,
  }), { heading: 'Published offer', source: 'offer' });
  assert.deepEqual(getAdminPriceDisplayState({
    bookingStatus: 'payment_pending', hasRecordedPricing: false, hasPublishedOffer: true, hasAcceptedOffer: true,
  }), { heading: 'Accepted offer', source: 'offer' });
  assert.deepEqual(getAdminPriceDisplayState({
    bookingStatus: 'payment_reported', hasRecordedPricing: false, hasPublishedOffer: true, hasAcceptedOffer: true,
  }), { heading: 'Accepted offer', source: 'offer' });
  assert.deepEqual(getAdminPriceDisplayState({
    bookingStatus: 'confirmed', hasRecordedPricing: false, hasPublishedOffer: true, hasAcceptedOffer: true,
  }), { heading: 'Confirmed price', source: 'offer' });
});
