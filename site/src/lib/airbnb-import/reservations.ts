import { isDeepStrictEqual } from 'node:util';
import type { Pool, PoolClient } from 'pg';
import type { ParsedAirbnbBooking } from './booking-pdf.ts';

export interface AirbnbBookingImportDocument {
  relativePath: string;
  sha256: string;
  pageCount: number;
  booking: ParsedAirbnbBooking;
  accessCodeCiphertext: Buffer | null;
  accessCodeKeyVersion: number | null;
}

export class AirbnbReservationImportConflict extends Error {
  readonly code = 'AIRBNB_RESERVATION_IMPORT_CONFLICT';
  readonly conversationId: string;

  constructor(conversationId: string, reason: string) {
    super(`Airbnb conversation ${conversationId}: ${reason}`);
    this.name = 'AirbnbReservationImportConflict';
    this.conversationId = conversationId;
  }
}

export function canonicalPayload(booking: ParsedAirbnbBooking): unknown {
  const reservation = { ...booking.reservation, accessCode: booking.reservation.accessCode ? '[encrypted]' : null };
  return {
    heading: booking.heading,
    reservation,
    conversationEntries: booking.conversationEntries,
    ...(booking.conversationCompleteness ? { conversationCompleteness: booking.conversationCompleteness } : {}),
  };
}

async function insertConversation(client: PoolClient, reservationId: string, booking: ParsedAirbnbBooking): Promise<void> {
  for (const entry of booking.conversationEntries) {
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO airbnb_conversation_entries
         (reservation_id, position, entry_type, sender_type, sender_display_name,
          body, displayed_date, displayed_time, sent_at, timestamp_precision, raw_entry)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
               CASE WHEN $9::text IS NULL THEN NULL ELSE $9::text::timestamptz END,
               $10, $11::jsonb)
       RETURNING id::text`,
      [
        reservationId, entry.position, entry.entryType, entry.senderType,
        entry.senderDisplayName, entry.body, entry.displayedDate, entry.displayedTime,
        entry.sentAt, entry.timestampPrecision, JSON.stringify(entry),
      ],
    );
    for (const [position, reaction] of entry.reactions.entries()) {
      await client.query(
        `INSERT INTO airbnb_conversation_reactions
           (conversation_entry_id, position, reaction)
         VALUES ($1, $2, $3)`,
        [inserted.rows[0].id, position, reaction],
      );
    }
  }
}

async function syncFinancialSummaries(
  client: PoolClient,
  reservationId: string,
  booking: ParsedAirbnbBooking,
): Promise<void> {
  const existing = await client.query<{
    perspective: string; currency: string; total_minor: string; arithmetic_status: string;
    arithmetic_difference_minor: string | null; raw_display_text: string;
  }>(
    `SELECT perspective, currency, total_minor::text, arithmetic_status,
            arithmetic_difference_minor::text, raw_display_text
       FROM airbnb_financial_summaries WHERE reservation_id=$1`,
    [reservationId],
  );
  if (existing.rowCount) {
    if (existing.rowCount !== booking.financialSummaries.length) {
      throw new AirbnbReservationImportConflict(booking.source.conversationId, 'financial perspectives are incomplete');
    }
    for (const summary of booking.financialSummaries) {
      const stored = existing.rows.find((row) => row.perspective === summary.perspective);
      if (!stored || stored.currency !== summary.currency || Number(stored.total_minor) !== summary.totalMinor
        || stored.arithmetic_status !== summary.arithmeticStatus
        || (stored.arithmetic_difference_minor === null ? null : Number(stored.arithmetic_difference_minor)) !== summary.arithmeticDifferenceMinor
        || stored.raw_display_text !== summary.rawDisplayText) {
        throw new AirbnbReservationImportConflict(booking.source.conversationId, `${summary.perspective} financial evidence conflicts`);
      }
    }
    return;
  }
  for (const summary of booking.financialSummaries) {
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO airbnb_financial_summaries
         (reservation_id, perspective, currency, total_minor, arithmetic_status,
          arithmetic_difference_minor, raw_display_text, captured_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz) RETURNING id::text`,
      [reservationId, summary.perspective, summary.currency, summary.totalMinor,
        summary.arithmeticStatus, summary.arithmeticDifferenceMinor, summary.rawDisplayText,
        booking.source.capturedAt],
    );
    const ids = new Map<number, string>();
    for (const item of summary.lineItems) {
      const line = await client.query<{ id: string }>(
        `INSERT INTO airbnb_financial_line_items
           (financial_summary_id, parent_line_item_id, position, item_type,
            description, service_date, quantity, unit_amount_minor, amount_minor, raw_display_text)
         VALUES ($1, $2, $3, $4, $5, $6::date, $7, $8, $9, $10) RETURNING id::text`,
        [inserted.rows[0].id, item.parentPosition === null ? null : ids.get(item.parentPosition),
          item.position, item.itemType, item.description, item.serviceDate, item.quantity,
          item.unitAmountMinor, item.amountMinor, item.rawDisplayText],
      );
      ids.set(item.position, line.rows[0].id);
    }
  }
}

async function insertReservation(
  client: PoolClient,
  document: AirbnbBookingImportDocument,
  sourceDocumentId: string,
): Promise<void> {
  const { booking } = document;
  const value = booking.reservation;
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO airbnb_reservations
       (conversation_id, confirmation_code, property_id, source_listing_name, booker_display_name,
        party_display_name, arrival, departure, nights, check_in_time,
        check_out_time, party_size, adults, children, infants, pets, booking_date,
        source_status_text, cancellation_policy, currency,
        headline_host_total_minor, source_captured_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8::date, $9, $10::time, $11::time,
             $12, $13, $14, $15, $16, $17::date, $18, $19, $20, $21,
             $22::timestamptz)
     RETURNING id::text`,
    [
      booking.source.conversationId, value.confirmationCode, value.propertyId, value.sourceListingName,
      value.bookerDisplayName, value.partyDisplayName, value.arrival, value.departure,
      value.nights, value.checkInTime, value.checkOutTime, value.partySize, value.adults,
      value.children, value.infants, value.pets, value.bookingDate, value.sourceStatusText,
      value.cancellationPolicy, value.currency, value.headlineHostTotalMinor,
      booking.source.capturedAt,
    ],
  );
  const reservationId = inserted.rows[0].id;
  await client.query(
    `INSERT INTO airbnb_reservation_documents
       (reservation_id, source_document_id, is_preferred)
     VALUES ($1, $2, TRUE)`,
    [reservationId, sourceDocumentId],
  );
  if (value.hostNotes || value.guestProfileText || document.accessCodeCiphertext) {
    await client.query(
      `INSERT INTO airbnb_reservation_private_details
         (reservation_id, host_notes, guest_profile_text, access_code_ciphertext,
          access_code_key_version, access_code_expires_at)
       VALUES ($1, $2, $3, $4, $5, $6::date + TIME '12:00')`,
      [
        reservationId, value.hostNotes, value.guestProfileText,
        document.accessCodeCiphertext, document.accessCodeKeyVersion,
        document.accessCodeCiphertext ? value.departure : null,
      ],
    );
  }
  await insertConversation(client, reservationId, booking);
  await syncFinancialSummaries(client, reservationId, booking);
}

// A newer capture updates the statistical record, not the immutable source evidence.
async function updateReservation(client: PoolClient, id: string, document: AirbnbBookingImportDocument): Promise<void> {
  const { booking } = document;
  const value = booking.reservation;
  const fields: Record<string, keyof ParsedAirbnbBooking['reservation']> = {
    confirmation_code: 'confirmationCode', property_id: 'propertyId', source_listing_name: 'sourceListingName',
    booker_display_name: 'bookerDisplayName', party_display_name: 'partyDisplayName',
    arrival: 'arrival', departure: 'departure', nights: 'nights', check_in_time: 'checkInTime', check_out_time: 'checkOutTime',
    party_size: 'partySize', adults: 'adults', children: 'children', infants: 'infants', pets: 'pets',
    booking_date: 'bookingDate', source_status_text: 'sourceStatusText', cancellation_policy: 'cancellationPolicy',
  };
  const validFinances = booking.financialSummaries.length === 2
    && new Set(booking.financialSummaries.map(s => s.perspective)).size === 2
    && booking.financialSummaries.every(s => s.arithmeticStatus === 'verified');
  if (validFinances) {
    fields.currency = 'currency';
    fields.headline_host_total_minor = 'headlineHostTotalMinor';
  }
  const parameters: unknown[] = [id];
  const assignments = Object.entries(fields).flatMap(([column, key]) => {
    const incoming = value[key];
    if (incoming === null || incoming === undefined || (typeof incoming === 'string' && !incoming.trim())) return [];
    parameters.push(incoming);
    return [`${column}=$${parameters.length}`];
  });
  parameters.push(booking.source.capturedAt);
  await client.query(`UPDATE airbnb_reservations SET ${assignments.join(',')}, source_captured_at=$${parameters.length}::timestamptz, updated_at=NOW() WHERE id=$1`, parameters);
  await client.query(`INSERT INTO airbnb_reservation_private_details
    (reservation_id,host_notes,guest_profile_text,access_code_ciphertext,access_code_key_version,access_code_expires_at)
    VALUES($1,$2,$3,$4,$5,CASE WHEN $4::bytea IS NOT NULL THEN $6::date + TIME '12:00' ELSE NULL END)
    ON CONFLICT(reservation_id) DO UPDATE SET
      host_notes=COALESCE(EXCLUDED.host_notes,airbnb_reservation_private_details.host_notes),
      guest_profile_text=COALESCE(EXCLUDED.guest_profile_text,airbnb_reservation_private_details.guest_profile_text),
      access_code_ciphertext=COALESCE(EXCLUDED.access_code_ciphertext,airbnb_reservation_private_details.access_code_ciphertext),
      access_code_key_version=COALESCE(EXCLUDED.access_code_key_version,airbnb_reservation_private_details.access_code_key_version),
      access_code_expires_at=CASE WHEN COALESCE(EXCLUDED.access_code_ciphertext,airbnb_reservation_private_details.access_code_ciphertext) IS NOT NULL THEN $6::date + TIME '12:00' ELSE NULL END,
      updated_at=NOW()`, [id, value.hostNotes?.trim() || null, value.guestProfileText?.trim() || null,
    document.accessCodeCiphertext, document.accessCodeCiphertext ? document.accessCodeKeyVersion : null, value.departure]);
  if (validFinances) {
    // Totals and their dependent lines are replaced together within this transaction.
    await client.query('DELETE FROM airbnb_financial_summaries WHERE reservation_id=$1', [id]);
    await syncFinancialSummaries(client, id, booking);
  }
  if (!booking.conversationCompleteness) await appendNewMessages(client, id, booking);
}

async function appendNewMessages(client: PoolClient, id: string, booking: ParsedAirbnbBooking): Promise<void> {
  const stored = (await client.query<{ position: number; raw_entry: ParsedAirbnbBooking['conversationEntries'][number] }>(
    'SELECT position, raw_entry FROM airbnb_conversation_entries WHERE reservation_id=$1 ORDER BY position', [id])).rows;
  const known = stored.map(row => row.raw_entry);
  const normalise = (text: string) => text.replace(/\s+/gu, ' ').trim();
  let position = stored.reduce((max, row) => Math.max(max, row.position), -1) + 1;
  // Without stable Airbnb message IDs, only append unambiguous dated entries
  // after the stored timeline. Edited/undated/overlapping entries remain in evidence.
  let latest = known.reduce((max, entry) => Math.max(max, entry.sentAt ? Date.parse(entry.sentAt) : 0), 0);
  const additions: ParsedAirbnbBooking['conversationEntries'] = [];
  for (const entry of booking.conversationEntries) {
    if (known.some(old => old.senderType === entry.senderType && normalise(old.body) === normalise(entry.body)
      && (!old.sentAt || !entry.sentAt || old.sentAt === entry.sentAt))) continue;
    const time = entry.sentAt ? Date.parse(entry.sentAt) : NaN;
    if (!Number.isFinite(time) || (known.length && (!latest || time <= latest))) continue;
    additions.push({ ...entry, position: position++ });
    known.push(entry);
    latest = Math.max(latest, time);
  }
  await insertConversation(client, id, { ...booking, conversationEntries: additions });
}

export async function importAirbnbReservations(
  input: { sourceSnapshotOn: string; documents: AirbnbBookingImportDocument[] },
  database: Pool,
): Promise<{
  batchId: string;
  documentsProcessed: number;
  documentsAdded: number;
  reservationsAdded: number;
  reservationsUnchanged: number;
  reservationsUpdated: number;
}> {
  const batch = await database.query<{ id: string }>(
    `INSERT INTO airbnb_import_batches
       (source_collection, source_snapshot_on, importer_schema_version, expected_count)
     VALUES ('combined', $1::date, 1, $2) RETURNING id::text`,
    [input.sourceSnapshotOn, input.documents.length],
  );
  const batchId = batch.rows[0].id;
  const client = await database.connect();
  let documentsAdded = 0;
  let reservationsAdded = 0;
  let reservationsUnchanged = 0;
  let reservationsUpdated = 0;
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('airbnb-booking-import'))");
    for (const document of input.documents) {
      const conversationId = document.booking.source.conversationId;
      if (document.booking.conversationCompleteness && (document.booking.conversationEntries.length
        || document.booking.conversationCompleteness.status !== 'incomplete'
        || document.booking.financialSummaries.length !== 2
        || document.booking.financialSummaries.some(item => item.arithmeticStatus !== 'verified'))) {
        throw new AirbnbReservationImportConflict(conversationId, 'incomplete conversation requires no message entries and verified finances');
      }
      const hashMatch = await client.query<{ id: string; document_type: string; source_external_id: string; raw_extraction: ParsedAirbnbBooking }>(
        `SELECT id::text, document_type, source_external_id, raw_extraction
           FROM airbnb_source_documents WHERE sha256 = $1`,
        [document.sha256],
      );
      if (hashMatch.rowCount && (hashMatch.rows[0].document_type !== 'booking'
        || hashMatch.rows[0].source_external_id !== conversationId)) {
        throw new AirbnbReservationImportConflict(conversationId, 'document hash belongs to different source evidence');
      }
      if (hashMatch.rowCount && (!isDeepStrictEqual(canonicalPayload(hashMatch.rows[0].raw_extraction), canonicalPayload(document.booking))
        || !isDeepStrictEqual(hashMatch.rows[0].raw_extraction.financialSummaries, document.booking.financialSummaries))) {
        throw new AirbnbReservationImportConflict(conversationId, 'same source hash has different parsed content');
      }
      const existing = await client.query<{ id: string; source_captured_at: Date; raw_extraction: ParsedAirbnbBooking }>(
        `SELECT reservation.id::text, reservation.source_captured_at, source.raw_extraction
           FROM airbnb_reservations reservation
           JOIN airbnb_reservation_documents link ON link.reservation_id = reservation.id AND link.is_preferred
           JOIN airbnb_source_documents source ON source.id = link.source_document_id
          WHERE reservation.conversation_id = $1`,
        [conversationId],
      );
      let sourceDocumentId = hashMatch.rows[0]?.id;
      if (!sourceDocumentId) {
        const rawExtraction = structuredClone(document.booking);
        rawExtraction.reservation.accessCode = document.booking.reservation.accessCode ? '[encrypted]' : null;
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO airbnb_source_documents
             (import_batch_id, document_type, relative_path, sha256,
              source_external_id, page_count, captured_at, raw_extraction)
           VALUES ($1, 'booking', $2, $3, $4, $5, $6::timestamptz, $7::jsonb)
           RETURNING id::text`,
          [batchId, document.relativePath, document.sha256, conversationId,
            document.pageCount, document.booking.source.capturedAt, JSON.stringify(rawExtraction)],
        );
        sourceDocumentId = inserted.rows[0].id;
        documentsAdded += 1;
      }
      if (existing.rowCount) {

        await client.query(
          `INSERT INTO airbnb_reservation_documents (reservation_id, source_document_id, is_preferred)
           VALUES ($1, $2, FALSE) ON CONFLICT (source_document_id) DO NOTHING`,
          [existing.rows[0].id, sourceDocumentId],
        );
        if (new Date(document.booking.source.capturedAt).getTime() > new Date(existing.rows[0].source_captured_at).getTime()) {
          await updateReservation(client, existing.rows[0].id, document);
          await client.query('UPDATE airbnb_reservation_documents SET is_preferred=FALSE WHERE reservation_id=$1', [existing.rows[0].id]);
          await client.query('UPDATE airbnb_reservation_documents SET is_preferred=TRUE WHERE reservation_id=$1 AND source_document_id=$2', [existing.rows[0].id, sourceDocumentId]);
          reservationsUpdated += 1;
        } else {
          reservationsUnchanged += 1;
        }
      } else {
        await insertReservation(client, document, sourceDocumentId);
        reservationsAdded += 1;
      }
    }
    await client.query(
      `UPDATE airbnb_import_batches SET status='completed', imported_count=$2, completed_at=NOW(), diagnostics=jsonb_build_object('reservationsUpdated',$3::int) WHERE id=$1`,
      [batchId, input.documents.length, reservationsUpdated],
    );
    await client.query('COMMIT');
    return { batchId, documentsProcessed: input.documents.length, documentsAdded, reservationsAdded, reservationsUnchanged, reservationsUpdated };
  } catch (error) {
    await client.query('ROLLBACK');
    await client.query(
      `UPDATE airbnb_import_batches
          SET status='failed', completed_at=NOW(), diagnostics=jsonb_build_object('errorCode',$2::text)
        WHERE id=$1`,
      [batchId, error instanceof AirbnbReservationImportConflict ? error.code : 'AIRBNB_RESERVATION_IMPORT_FAILED'],
    );
    throw error;
  } finally {
    client.release();
  }
}
