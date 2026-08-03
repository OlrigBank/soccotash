export type CancellationDisplayState = {
  statusHeading: string;
  paymentHeading: string;
  paymentState: string;
  priceHeading: string;
  totalLabel: string;
};

export function hasAcceptedOfferEvidence(input: {
  acceptedAt: string | null;
  customerStatus: string;
  bookingStatus: string;
}): boolean {
  return Boolean(input.acceptedAt)
    || input.customerStatus === 'accepted'
    || ['payment_pending', 'payment_reported', 'confirmed', 'approved'].includes(input.bookingStatus);
}

export function getCancellationDisplayState(input: {
  cancelled: boolean;
  fullyPaid: boolean;
  acceptedOffer: boolean;
}): CancellationDisplayState {
  if (input.cancelled) {
    return {
      statusHeading: 'Booking cancelled',
      paymentHeading: 'Payment history at cancellation',
      paymentState: 'Payment record retained',
      priceHeading: 'Price at cancellation',
      totalLabel: input.acceptedOffer ? 'Accepted total' : 'Recorded provisional total',
    };
  }

  return {
    statusHeading: input.fullyPaid ? 'Booking confirmed and fully paid' : 'Booking active',
    paymentHeading: input.fullyPaid ? 'Booking confirmed and fully paid' : 'Accepted payment plan',
    paymentState: input.fullyPaid ? 'Paid' : 'Payment plan active',
    priceHeading: input.acceptedOffer ? 'Accepted offer' : 'Current offer',
    totalLabel: input.acceptedOffer ? 'Accepted total' : 'Total',
  };
}

export type CancellationInputValidation =
  | { accepted: false; code: 'confirmation_required' | 'reason_required' }
  | { accepted: true; reason: string };

export function validateCancellationInput(input: {
  confirmed: boolean;
  reason: string;
}): CancellationInputValidation {
  if (!input.confirmed) return { accepted: false, code: 'confirmation_required' };
  const reason = input.reason.trim().slice(0, 1000);
  if (!reason) return { accepted: false, code: 'reason_required' };
  return { accepted: true, reason };
}
