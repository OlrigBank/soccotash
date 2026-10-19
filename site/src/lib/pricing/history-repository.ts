import type pg from 'pg';
import { getPool } from '../booking/db.ts';
import { analyseHistory, type HistoryInput, type HistoryReservation } from './history.ts';

export const HISTORY_SOURCE_LIMIT = 50_000;

/** One bounded, read-only snapshot. No private guest fields enter this query. */
export async function loadHistoryReservations(input: Pick<HistoryInput, 'startDate' | 'endDate'>, pool: pg.Pool = getPool()): Promise<HistoryReservation[]> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL statement_timeout = '15s'");
    const result = await client.query<{ reservation: HistoryReservation }>(`
      SELECT jsonb_build_object(
        'id', r.id::text, 'propertyId', r.property_id,
        'arrival', r.arrival::text, 'departure', r.departure::text,
        'nights', r.nights, 'status', r.source_status_text, 'currency', r.currency,
        'capturedAt', r.source_captured_at,
        'financials', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'perspective', f.perspective, 'currency', f.currency,
            'totalPence', f.total_minor, 'arithmeticStatus', f.arithmetic_status,
            'lines', COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                'id', l.id::text, 'parentId', l.parent_line_item_id::text,
                'type', l.item_type, 'description', l.description,
                'serviceDate', l.service_date::text, 'amountPence', l.amount_minor
              ) ORDER BY l.position, l.id)
              FROM airbnb_financial_line_items l WHERE l.financial_summary_id = f.id
            ), '[]'::jsonb)
          ) ORDER BY f.perspective)
          FROM airbnb_financial_summaries f WHERE f.reservation_id = r.id
        ), '[]'::jsonb)
      ) AS reservation
      FROM airbnb_reservations r
      WHERE r.arrival <= $2::date AND r.departure > $1::date
      ORDER BY r.arrival, r.id LIMIT $3`, [input.startDate, input.endDate, HISTORY_SOURCE_LIMIT + 1]);
    if (result.rows.length > HISTORY_SOURCE_LIMIT) throw new Error('The historical range contains too many reservations. Choose a shorter range.');
    await client.query('COMMIT');
    return result.rows.map(row => row.reservation);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

export async function getHistoryReport(input: HistoryInput, pool?: pg.Pool, now = new Date()) {
  return analyseHistory(await loadHistoryReservations(input, pool), input, now);
}
