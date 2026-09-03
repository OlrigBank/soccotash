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

function canonicalPayload(booking: ParsedAirbnbBooking): unknown {
  const reservation = { ...booking.reservation, accessCode: booking.reservation.accessCode ? '[encrypted]' : null };
  return {
    heading: booking.heading,
    reservation,
    conversationEntries: booking.conversationEntries,
  };
}

function storedPayload(value: ParsedAirbnbBooking): unknown {
  return canonicalPayload(value);
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

export async function importAirbnbReservations(
  input: { sourceSnapshotOn: string; documents: AirbnbBookingImportDocument[] },
  database: Pool,
): Promise<{
  batchId: string;
  documentsProcessed: number;
  documentsAdded: number;
  reservationsAdded: number;
  reservationsUnchanged: number;
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
  try {
    await client.query('BEGIN');
    for (const document of input.documents) {
      const conversationId = document.booking.source.conversationId;
      const hashMatch = await client.query<{ id: string; document_type: string; source_external_id: string }>(
        `SELECT id::text, document_type, source_external_id
           FROM airbnb_source_documents WHERE sha256 = $1`,
        [document.sha256],
      );
      if (hashMatch.rowCount && (hashMatch.rows[0].document_type !== 'booking'
        || hashMatch.rows[0].source_external_id !== conversationId)) {
        throw new AirbnbReservationImportConflict(conversationId, 'document hash belongs to different source evidence');
      }
      const existing = await client.query<{ id: string; raw_extraction: ParsedAirbnbBooking }>(
        `SELECT reservation.id::text, source.raw_extraction
           FROM airbnb_reservations reservation
           JOIN airbnb_reservation_documents link ON link.reservation_id = reservation.id AND link.is_preferred
           JOIN airbnb_source_documents source ON source.id = link.source_document_id
          WHERE reservation.conversation_id = $1`,
        [conversationId],
      );
      if (existing.rowCount && !isDeepStrictEqual(
        storedPayload(existing.rows[0].raw_extraction),
        canonicalPayload(document.booking),
      )) {
        throw new AirbnbReservationImportConflict(conversationId, 'canonical content conflicts with stored evidence');
      }
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
        await syncFinancialSummaries(client, existing.rows[0].id, document.booking);
        await client.query(
          `INSERT INTO airbnb_reservation_documents (reservation_id, source_document_id, is_preferred)
           VALUES ($1, $2, FALSE) ON CONFLICT (source_document_id) DO NOTHING`,
          [existing.rows[0].id, sourceDocumentId],
        );
        reservationsUnchanged += 1;
      } else {
        await insertReservation(client, document, sourceDocumentId);
        reservationsAdded += 1;
      }
    }
    await client.query(
      `UPDATE airbnb_import_batches SET status='completed', imported_count=$2, completed_at=NOW() WHERE id=$1`,
      [batchId, input.documents.length],
    );
    await client.query('COMMIT');
    return { batchId, documentsProcessed: input.documents.length, documentsAdded, reservationsAdded, reservationsUnchanged };
  } catch (error) {
    await client.query('ROLLBACK');
    await database.query(
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
