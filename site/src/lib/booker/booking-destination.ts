// Unfinished requests resume their payment/review step; paid stays open their reservation.
export function bookingDestination(booking: { reference: string; status: string; hasVerifiedPayment: boolean; hasReportedPayment?: boolean }): string {
  if (booking.status === 'payment_reported' || booking.hasReportedPayment) return `/booking/manage/${booking.reference}/`;
  const unfinished = ['pending', 'offered', 'payment_pending'].includes(booking.status);
  return `/booking/manage/${booking.reference}/${unfinished && !booking.hasVerifiedPayment ? 'payment/' : 'reservation/'}`;
}

export function safeBookerReturnPath(value: string | null): string | null {
  if (!value) return null;
  if (value === '/booking/account/' || /^\/booking\/manage\/[0-9a-f-]{36}\/(?:[a-z/-]*)?$/.test(value)) return value;
  if (/^\/book\/\?booking=[0-9a-f-]{36}&step=(?:stay|details)$/.test(value)) return value;
  return null;
}
