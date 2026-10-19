import type pg from 'pg';
import { getPool } from '../booking/db.ts';
import { ReservationExportLimitError, RESERVATION_EXPORT_MAX_BYTES, RESERVATION_EXPORT_MAX_RESERVATIONS, type ReservationExportSource } from './reservation-export-types.ts';

/** A private allowlist query: deliberately independent of pricing eligibility and guest details. */
export async function loadReservationExport(pool: pg.Pool = getPool()): Promise<ReservationExportSource[]> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL statement_timeout = '15s'");
    const count = await client.query<{ count: number }>('SELECT count(*)::int AS count FROM airbnb_reservations');
    if (count.rows[0].count > RESERVATION_EXPORT_MAX_RESERVATIONS) throw new ReservationExportLimitError('There are too many reservations to export in one archive.');
    if (count.rows[0].count === 0) { await client.query('COMMIT'); return []; }
    await client.query(`DECLARE reservation_evidence_cursor NO SCROLL CURSOR FOR
      SELECT jsonb_build_object(
        'reservation_id', r.public_id::text, 'confirmation_code', r.confirmation_code,
        'property_id', r.property_id, 'source_listing_name', r.source_listing_name,
        'source_status_text', r.source_status_text, 'arrival', r.arrival::text,
        'departure', r.departure::text, 'nights', r.nights,
        'check_in_time', r.check_in_time::text, 'check_out_time', r.check_out_time::text,
        'booking_date', r.booking_date::text, 'party_size', r.party_size,
        'adults', r.adults, 'children', r.children, 'infants', r.infants, 'pets', r.pets,
        'cancellation_policy', r.cancellation_policy, 'currency', r.currency,
        'headline_host_total_minor', r.headline_host_total_minor::text,
        'source_captured_at', r.source_captured_at, 'updated_at', r.updated_at,
        'panels', COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'id', f.id::text, 'perspective', f.perspective, 'currency', f.currency,
          'total_minor', f.total_minor::text, 'arithmetic_status', f.arithmetic_status,
          'arithmetic_difference_minor', f.arithmetic_difference_minor::text,
          'raw_display_text', f.raw_display_text, 'captured_at', f.captured_at,
          'lines', COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'id', l.id::text, 'parent_id', l.parent_line_item_id::text,
            'position', l.position, 'item_type', l.item_type, 'description', l.description,
            'service_date', l.service_date::text, 'quantity', l.quantity::text,
            'unit_amount_minor', l.unit_amount_minor::text, 'amount_minor', l.amount_minor::text,
            'raw_display_text', l.raw_display_text, 'created_at', l.created_at
          ) ORDER BY l.position,l.id) FROM airbnb_financial_line_items l
          WHERE l.financial_summary_id=f.id), '[]'::jsonb)
        ) ORDER BY f.perspective,f.id) FROM airbnb_financial_summaries f
        WHERE f.reservation_id=r.id), '[]'::jsonb)
      ) AS reservation
      FROM airbnb_reservations r ORDER BY r.arrival,r.public_id
      LIMIT $1`, [RESERVATION_EXPORT_MAX_RESERVATIONS + 1]);
    const source: ReservationExportSource[] = [];
    let bytes = 0;
    // Enforce the byte budget while fetching rather than materialising all reservations first.
    for (;;) {
      const batch = await client.query<{ reservation: ReservationExportSource }>('FETCH FORWARD 100 FROM reservation_evidence_cursor');
      for (const row of batch.rows) {
        bytes += Buffer.byteLength(JSON.stringify(row.reservation));
        if (bytes > RESERVATION_EXPORT_MAX_BYTES) throw new ReservationExportLimitError('The reservation evidence is too large to export in one archive.');
        source.push(row.reservation);
      }
      if (batch.rows.length < 100) break;
    }
    await client.query('COMMIT');
    return source;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
