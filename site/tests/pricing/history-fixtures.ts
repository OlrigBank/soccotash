import type pg from 'pg';
import type { HistoryReservation, HistoryFinancial, HistoryLine } from '../../src/lib/pricing/history.ts';

export function reservationFixture(id = '1', arrival = '2024-07-01', nights = 7, exact = true): HistoryReservation {
  const dates = Array.from({ length: nights }, (_, i) => new Date(Date.parse(arrival) + i * 86_400_000).toISOString().slice(0, 10));
  const amounts = dates.map(date => [5, 6].includes(new Date(date).getUTCDay()) ? 15000 : 10000);
  const total = amounts.reduce((a, b) => a + b, 0);
  const line = (id: string, type: string, amountPence: number, description = type, parentId: string | null = null, serviceDate: string | null = null): HistoryLine => ({ id, type, amountPence, description, parentId, serviceDate });
  const guest: HistoryFinancial = { perspective: 'guest_paid', currency: 'GBP', totalPence: total + 6000, arithmeticStatus: 'verified', lines: [
    line('accommodation', 'accommodation', total), line('cleaning', 'other', 3000, 'Cleaning fee'),
    line('tax', 'tax', 1000), line('guest-fee', 'guest_service_fee', 2000), line('total', 'total', total + 6000),
  ] };
  const host: HistoryFinancial = { perspective: 'host_earnings', currency: 'GBP', totalPence: total - 2500, arithmeticStatus: 'verified', lines: [
    line('room', 'accommodation', total),
    ...(exact ? dates.map((date, i) => line(`night-${i}`, 'nightly_charge', amounts[i], `Night ${i}`, 'room', date)) : []),
    line('host-fee', 'host_service_fee', -2500), line('host-total', 'total', total - 2500),
  ] };
  return { id, arrival, departure: new Date(Date.parse(arrival) + nights * 86_400_000).toISOString().slice(0, 10), nights,
    propertyId: 'main-house', status: 'Confirmed', currency: 'GBP', capturedAt: '2026-09-01T00:00:00.000Z', financials: [guest, host] };
}

export function historyFixtures(): HistoryReservation[] {
  const fixtures: HistoryReservation[] = [];
  for (const year of [2023, 2024, 2025]) for (const day of [1, 8, 15, 22]) fixtures.push(reservationFixture(String(fixtures.length + 1), `${year}-07-${String(day).padStart(2, '0')}`));
  for (const year of [2024, 2025]) for (const day of [1, 10, 20]) fixtures.push(reservationFixture(String(fixtures.length + 1), `${year}-08-${String(day).padStart(2, '0')}`, 4, false));
  fixtures.push({ ...reservationFixture('19'), status: 'Cancelled' });
  fixtures.push({ ...reservationFixture('20'), status: null });
  fixtures.push({ ...reservationFixture('21'), financials: [] });
  fixtures.push({ ...reservationFixture('22'), currency: 'EUR' });
  fixtures.push({ ...reservationFixture('23'), propertyId: 'cottage' });
  fixtures.push({ ...reservationFixture('24'), propertyId: null });
  return fixtures;
}

/** Only call with the disposable fixture schema's pool. */
export async function seedHistoryFixtures(database: pg.Pool): Promise<void> {
  for (const r of historyFixtures()) {
    const result = await database.query(`INSERT INTO airbnb_reservations
      (conversation_id, property_id, source_listing_name, booker_display_name, arrival, departure, nights,
       source_status_text, cancellation_policy, currency, source_captured_at)
      VALUES ($1,$2,'Disposable listing','PRIVATE_FIXTURE_GUEST',$3,$4,$5,$6,'Flexible',$7,$8) RETURNING id`,
    [`990000${r.id.padStart(5, '0')}`, r.propertyId, r.arrival, r.departure, r.nights, r.status, r.currency, r.capturedAt]);
    for (const f of r.financials) {
      const financial = await database.query(`INSERT INTO airbnb_financial_summaries
        (reservation_id,perspective,currency,total_minor,arithmetic_status,raw_display_text,captured_at)
        VALUES ($1,$2,$3,$4,$5,'PRIVATE_FIXTURE_FINANCIAL',$6) RETURNING id`,
      [result.rows[0].id, f.perspective, f.currency, f.totalPence, f.arithmeticStatus, r.capturedAt]);
      const ids = new Map<string, string>();
      for (const [position, l] of f.lines.entries()) {
        const item = await database.query(`INSERT INTO airbnb_financial_line_items
          (financial_summary_id,parent_line_item_id,position,item_type,description,service_date,amount_minor,raw_display_text)
          VALUES ($1,$2,$3,$4,$5,$6,$7,'PRIVATE_FIXTURE_RAW_LINE') RETURNING id`,
        [financial.rows[0].id, l.parentId ? ids.get(l.parentId) : null, position, l.type, l.description, l.serviceDate, l.amountPence]);
        ids.set(l.id, item.rows[0].id);
      }
    }
  }
}
