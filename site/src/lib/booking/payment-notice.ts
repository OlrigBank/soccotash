export const BANK_TRANSFER_REPORTED_NOTICE =
  'Bank transfer reported. Olrig Bank will verify the payment before confirming your booking.';

export function getBookingPaymentNotice(
  paymentResult: string | null | undefined,
  bookingStatus: string,
): string {
  return paymentResult === 'bank-transfer-reported' && bookingStatus === 'payment_reported'
    ? BANK_TRANSFER_REPORTED_NOTICE
    : '';
}

export function isCurrentPaymentReportResult(
  paymentResult: string | null | undefined,
  bookingStatus: string,
): boolean {
  return paymentResult === 'bank-transfer-reported' && bookingStatus === 'payment_reported';
}
