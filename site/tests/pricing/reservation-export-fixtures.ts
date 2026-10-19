import { unzipSync } from 'fflate';
import { reservationFixture } from './history-fixtures.ts';
import type { ReservationExportSource } from '../../src/lib/pricing/reservation-export-types.ts';

export function reservationExportFixture(number = 1): ReservationExportSource {
  const r = reservationFixture();
  return {
    reservation_id: `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`,
    confirmation_code: 'HM-FIXTURE', property_id: r.propertyId, source_listing_name: 'Disposable listing', source_status_text: r.status,
    arrival: r.arrival, departure: r.departure, nights: r.nights, check_in_time: '16:00:00', check_out_time: '10:00:00',
    booking_date: '2024-06-01', party_size: 4, adults: 2, children: 2, infants: 0, pets: null, cancellation_policy: 'Flexible',
    currency: 'GBP', headline_host_total_minor: '77500', source_captured_at: r.capturedAt, updated_at: r.capturedAt,
    panels: r.financials.map((f, i) => ({ id: String(i + 1), perspective: f.perspective, currency: f.currency,
      total_minor: String(f.totalPence), arithmetic_status: f.arithmeticStatus, arithmetic_difference_minor: null,
      raw_display_text: `Original ${f.perspective}\n£${(f.totalPence / 100).toFixed(2)}`, captured_at: r.capturedAt,
      lines: f.lines.map((l, j) => ({ id: `${i + 1}-${l.id}`, parent_id: l.parentId ? `${i + 1}-${l.parentId}` : null,
        position: j, item_type: l.type, description: l.description, service_date: l.serviceDate,
        quantity: l.type === 'accommodation' ? '7.000' : null, unit_amount_minor: null,
        amount_minor: String(l.amountPence), raw_display_text: `${l.description}\n${l.amountPence}`, created_at: r.capturedAt,
      })),
    })),
  };
}

/** Independent RFC-style CSV reader for assertions, including multiline quoted fields. */
export function parseExportCsv(input: string): Array<Record<string, string>> {
  const text = input.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (quoted) throw new Error('Unclosed CSV quote.');
  if (field || row.length) { row.push(field); rows.push(row); }
  const headings = rows.shift() ?? [];
  return rows.map(values => {
    if (values.length !== headings.length) throw new Error('Non-rectangular CSV.');
    return Object.fromEntries(headings.map((name, i) => [name, values[i]]));
  });
}
export function readReservationArchive(bytes: Uint8Array): Record<string, string> {
  return Object.fromEntries(Object.entries(unzipSync(bytes)).map(([name, value]) => [name, new TextDecoder('utf-8', { ignoreBOM: true }).decode(value)]));
}
