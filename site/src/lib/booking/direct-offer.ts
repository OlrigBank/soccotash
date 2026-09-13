/** Shared, conservative eligibility for a first offer at the published total. */
export function directOfferDecision(input: {
  propertyId: string;
  administratorPriced?: boolean;
  occupancyOutcome?: string;
  promoCode?: string;
  pricingQuote?: { result: { eligible: boolean; guestTotalPence: number } } | null;
}): { automaticOffer: boolean; reviewReason: string | null } {
  const reviewReason = input.administratorPriced || input.propertyId === 'bespoke-arrangement'
    ? 'This bespoke request requires review before an offer can be made.'
    : input.propertyId === 'whole-property'
    ? 'Additional accommodation availability requires review.'
    : input.promoCode?.trim()
    ? 'Promo code requires review. No discount has been applied to this total.'
    : input.occupancyOutcome !== 'standard'
    ? 'This request requires review before an offer can be made.'
    : !input.pricingQuote?.result.eligible || !Number.isSafeInteger(input.pricingQuote.result.guestTotalPence) || input.pricingQuote.result.guestTotalPence <= 0
    ? 'Price to be agreed. This request requires review before an offer can be made.'
    : !['main-house', 'cottage'].includes(input.propertyId)
    ? 'This request requires review before an offer can be made.' : null;
  return { automaticOffer: reviewReason === null, reviewReason };
}
