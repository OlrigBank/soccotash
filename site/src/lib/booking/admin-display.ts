export type AdminPriceDisplayState = {
  heading: 'Price to be agreed' | 'Recorded provisional calculation' | 'Published offer' | 'Accepted offer' | 'Confirmed price' | 'Price at cancellation';
  source: 'recorded' | 'offer' | 'none';
};

const ACCEPTED_PRICE_STATUSES = new Set(['payment_pending', 'payment_reported', 'confirmed', 'approved', 'cancelled']);

export function shouldShowOfferPublishedNotice(published: boolean, bookingStatus: string): boolean {
  return published && bookingStatus === 'offered';
}

export function getAdminPriceDisplayState(input: {
  bookingStatus: string;
  hasRecordedPricing: boolean;
  hasPublishedOffer: boolean;
  hasAcceptedOffer: boolean;
}): AdminPriceDisplayState {
  if (input.hasAcceptedOffer && ACCEPTED_PRICE_STATUSES.has(input.bookingStatus)) {
    return {
      heading: input.bookingStatus === 'cancelled'
        ? 'Price at cancellation'
        : input.bookingStatus === 'confirmed' || input.bookingStatus === 'approved'
          ? 'Confirmed price'
          : 'Accepted offer',
      source: 'offer',
    };
  }
  if (input.bookingStatus === 'offered' && input.hasPublishedOffer) {
    return { heading: 'Published offer', source: 'offer' };
  }
  if (input.hasRecordedPricing) {
    return { heading: 'Recorded provisional calculation', source: 'recorded' };
  }
  return { heading: 'Price to be agreed', source: 'none' };
}
