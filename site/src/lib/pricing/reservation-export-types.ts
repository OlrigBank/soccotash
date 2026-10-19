/** Monetary/quantity strings come directly from PostgreSQL, without JS float conversion. */
export interface ReservationExportLine {
  id: string;
  parent_id: string | null;
  position: number;
  item_type: string;
  description: string;
  service_date: string | null;
  quantity: string | null;
  unit_amount_minor: string | null;
  amount_minor: string;
  raw_display_text: string;
  created_at: string;
}
export interface ReservationExportPanel {
  id: string;
  perspective: 'host_earnings' | 'guest_paid';
  currency: string;
  total_minor: string;
  arithmetic_status: string;
  arithmetic_difference_minor: string | null;
  raw_display_text: string;
  captured_at: string;
  lines: ReservationExportLine[];
}
export interface ReservationExportSource {
  reservation_id: string;
  confirmation_code: string | null;
  property_id: string | null;
  source_listing_name: string;
  source_status_text: string | null;
  arrival: string;
  departure: string;
  nights: number;
  check_in_time: string | null;
  check_out_time: string | null;
  booking_date: string | null;
  party_size: number | null;
  adults: number | null;
  children: number | null;
  infants: number | null;
  pets: number | null;
  cancellation_policy: string;
  currency: string;
  headline_host_total_minor: string | null;
  source_captured_at: string;
  updated_at: string;
  panels: ReservationExportPanel[];
}
export const RESERVATION_EXPORT_SCHEMA_VERSION = '1.0';
export const RESERVATION_EXPORT_MAX_RESERVATIONS = 50_000;
export const RESERVATION_EXPORT_MAX_BYTES = 32 * 1024 * 1024;
export class ReservationExportLimitError extends Error {}
