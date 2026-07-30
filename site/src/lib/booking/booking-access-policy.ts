export const BOOKING_ACCESS_EXPIRY_ENV = 'BOOKING_ACCESS_EXPIRY_DAYS_AFTER_DEPARTURE';
export const DEFAULT_BOOKING_ACCESS_EXPIRY_DAYS = 90;
export const MAX_BOOKING_ACCESS_EXPIRY_DAYS = 3650;

export type BookingAccessState = 'active' | 'revoked' | 'expired';

export function getBookingAccessExpiryDays(
  rawValue: string | undefined = process.env[BOOKING_ACCESS_EXPIRY_ENV],
): number {
  const parsed = Number(rawValue);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= MAX_BOOKING_ACCESS_EXPIRY_DAYS
    ? parsed
    : DEFAULT_BOOKING_ACCESS_EXPIRY_DAYS;
}

export function bookingAccessExpiresOn(departure: string, days = getBookingAccessExpiryDays()): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(departure)) throw new Error('INVALID_BOOKING_DEPARTURE');
  const value = new Date(`${departure}T12:00:00Z`);
  if (Number.isNaN(value.getTime())) throw new Error('INVALID_BOOKING_DEPARTURE');
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function bookingAccessState(input: {
  departure: string;
  revokedAt?: string | Date | null;
  today?: string;
  expiryDays?: number;
}): BookingAccessState {
  if (input.revokedAt) return 'revoked';
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  return today > bookingAccessExpiresOn(input.departure, input.expiryDays)
    ? 'expired'
    : 'active';
}
