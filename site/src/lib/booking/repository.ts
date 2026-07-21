import { getAvailabilityProperty, getPropertiesSharingAvailability, getProperty } from './config';
import { getPool } from './db';
import type { ImportedBlock } from './ical';
import type { PublishedPricingQuote } from '../pricing/types';

export type BookingBlock = {
  startsOn: string;
  endsOn: string;
  source: string;
};

export async function recordSyncAttempt(propertyId: string): Promise<void> {
  await getPool().query(
    `INSERT INTO calendar_sync_status (property_id, last_attempt_at)
     VALUES ($1, NOW())
     ON CONFLICT (property_id) DO UPDATE SET last_attempt_at = NOW()`,
    [propertyId],
  );
}

export async function replaceImportedBlocks(propertyId: string, blocks: ImportedBlock[], feedCount: number): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("DELETE FROM booking_blocks WHERE property_id = $1 AND source = 'airbnb'", [propertyId]);
    for (const block of blocks) {
      await client.query(
        `INSERT INTO booking_blocks (property_id, source, external_uid, starts_on, ends_on)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (property_id, source, external_uid)
         DO UPDATE SET starts_on = EXCLUDED.starts_on, ends_on = EXCLUDED.ends_on, updated_at = NOW()`,
        [propertyId, block.source, block.externalUid, block.startsOn, block.endsOn],
      );
    }
    await client.query(
      `INSERT INTO calendar_sync_status
       (property_id, last_attempt_at, last_success_at, last_error, imported_blocks, feed_count)
       VALUES ($1, NOW(), NOW(), NULL, $2, $3)
       ON CONFLICT (property_id) DO UPDATE SET
         last_attempt_at = NOW(),
         last_success_at = NOW(),
         last_error = NULL,
         imported_blocks = EXCLUDED.imported_blocks,
         feed_count = EXCLUDED.feed_count`,
      [propertyId, blocks.length, feedCount],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function recordSyncError(propertyId: string, error: unknown): Promise<void> {
  await getPool().query(
    `INSERT INTO calendar_sync_status (property_id, last_attempt_at, last_error)
     VALUES ($1, NOW(), $2)
     ON CONFLICT (property_id) DO UPDATE SET last_attempt_at = NOW(), last_error = EXCLUDED.last_error`,
    [propertyId, error instanceof Error ? error.message : String(error)],
  );
}

export async function getBlocks(propertyId: string, from: string, to: string): Promise<BookingBlock[]> {
  const property = getProperty(propertyId);
  const availabilityProperty = property ? getAvailabilityProperty(property) : undefined;
  if (!property || !availabilityProperty) throw new Error(`Unknown booking property: ${propertyId}`);
  const linkedPropertyIds = getPropertiesSharingAvailability(property).map((candidate) => candidate.id);

  const result = await getPool().query(
    `SELECT starts_on::text AS "startsOn", ends_on::text AS "endsOn", source
     FROM booking_blocks
     WHERE property_id = $1 AND starts_on < $3::date AND ends_on > $2::date
     UNION ALL
     SELECT arrival::text AS "startsOn", departure::text AS "endsOn", 'provisional' AS source
     FROM provisional_bookings
     WHERE property_id = ANY($4::text[]) AND status IN ('pending', 'offered', 'approved')
       AND arrival < $3::date AND departure > $2::date
     ORDER BY "startsOn"`,
    [availabilityProperty.id, from, to, linkedPropertyIds],
  );
  return result.rows;
}

export async function isCalendarStale(propertyId: string, minutes = 30): Promise<boolean> {
  const result = await getPool().query(
    `SELECT last_success_at IS NULL OR last_success_at < NOW() - ($2 * INTERVAL '1 minute') AS stale
     FROM calendar_sync_status WHERE property_id = $1`,
    [propertyId, minutes],
  );
  return result.rowCount === 0 || Boolean(result.rows[0].stale);
}

export async function createProvisionalBooking(input: {
  propertyId: string;
  arrival: string;
  departure: string;
  guests: number;
  pets: number;
  name: string;
  email: string;
  telephone?: string;
  message?: string;
  pricingQuote?: PublishedPricingQuote | null;
}): Promise<string> {
  const property = getProperty(input.propertyId);
  const availabilityProperty = property ? getAvailabilityProperty(property) : undefined;
  if (!property || !availabilityProperty) throw new Error(`Unknown booking property: ${input.propertyId}`);
  const linkedPropertyIds = getPropertiesSharingAvailability(property).map((candidate) => candidate.id);

  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [availabilityProperty.id]);
    const conflict = await client.query(
      `SELECT 1 FROM booking_blocks
       WHERE property_id=$1 AND starts_on < $3::date AND ends_on > $2::date
       UNION ALL
       SELECT 1 FROM provisional_bookings
       WHERE property_id = ANY($4::text[]) AND status IN ('pending','offered','approved')
         AND arrival < $3::date AND departure > $2::date LIMIT 1`,
      [availabilityProperty.id, input.arrival, input.departure, linkedPropertyIds],
    );
    if (conflict.rowCount) throw new Error('DATES_UNAVAILABLE');
    const result = await client.query(
      `INSERT INTO provisional_bookings
       (property_id, arrival, departure, guests, pets, guest_name, guest_email, guest_telephone, guest_message,
        pricing_plan_id, pricing_plan_version, pricing_currency, accommodation_pence, fees_pence,
        guest_total_pence, channel_commission_pence, owner_revenue_pence, pricing_input, pricing_result, quoted_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,$19::jsonb,$20)
       RETURNING public_id`,
      [
        input.propertyId, input.arrival, input.departure, input.guests, input.pets, input.name, input.email,
        input.telephone || null, input.message || null,
        input.pricingQuote?.plan.id ?? null,
        input.pricingQuote?.plan.version ?? null,
        input.pricingQuote?.result.currency ?? null,
        input.pricingQuote?.result.accommodationPence ?? null,
        input.pricingQuote?.result.feesPence ?? null,
        input.pricingQuote?.result.guestTotalPence ?? null,
        input.pricingQuote?.result.commissionPence ?? null,
        input.pricingQuote?.result.ownerRevenuePence ?? null,
        input.pricingQuote ? JSON.stringify(input.pricingQuote.input) : null,
        input.pricingQuote ? JSON.stringify(input.pricingQuote.result) : null,
        input.pricingQuote ? new Date() : null,
      ],
    );
    await client.query('COMMIT');
    return result.rows[0].public_id;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export type BookingOfferLine = {
  label: string;
  detail: string;
  amountPence: number;
};

export type BookingOffer = {
  id: string;
  publicId: string;
  currency: string;
  lineItems: BookingOfferLine[];
  totalPence: number;
  offerMessage: string | null;
  terms: string | null;
  validUntil: string | null;
  recipientEmail: string;
  subject: string;
  deliveryStatus: 'pending' | 'sent' | 'failed';
  deliveryMessageId: string | null;
  deliveryError: string | null;
  createdAt: string;
  sentAt: string | null;
  adminDisplayName: string | null;
};

export type ProvisionalBookingRequest = {
  internalId?: string;
  reference: string;
  propertyId: string;
  arrival: string;
  departure: string;
  guests: number;
  pets: number;
  name: string;
  email: string;
  telephone: string | null;
  message: string | null;
  status: string;
  pricingPlanId?: string | null;
  pricingPlanName?: string | null;
  pricingCurrency: string | null;
  accommodationPence?: number | null;
  feesPence?: number | null;
  guestTotalPence: number | null;
  pricingPlanVersion: number | null;
  pricingInput?: Record<string, unknown> | null;
  pricingResult?: Record<string, unknown> | null;
  quotedAt: string | null;
  createdAt: string;
  latestOfferTotalPence: number | null;
  latestOfferCurrency: string | null;
  latestOfferSentAt: string | null;
};

function normaliseBookingRow(row: Record<string, any>): ProvisionalBookingRequest {
  return {
    ...row,
    quotedAt: row.quotedAt ? new Date(row.quotedAt).toISOString() : null,
    createdAt: new Date(row.createdAt).toISOString(),
    latestOfferSentAt: row.latestOfferSentAt ? new Date(row.latestOfferSentAt).toISOString() : null,
  } as ProvisionalBookingRequest;
}

export async function getProvisionalBookingRequests(limit = 100): Promise<ProvisionalBookingRequest[]> {
  const result = await getPool().query(
    `SELECT pb.public_id::text AS reference, pb.property_id AS "propertyId", pb.arrival::text, pb.departure::text,
            pb.guests, pb.pets, pb.guest_name AS name, pb.guest_email AS email, pb.guest_telephone AS telephone,
            pb.guest_message AS message, pb.status, pb.pricing_currency AS "pricingCurrency",
            pb.guest_total_pence AS "guestTotalPence", pb.pricing_plan_version AS "pricingPlanVersion",
            pb.quoted_at AS "quotedAt", pb.created_at AS "createdAt",
            latest_offer.total_pence AS "latestOfferTotalPence",
            latest_offer.currency AS "latestOfferCurrency",
            latest_offer.sent_at AS "latestOfferSentAt"
       FROM provisional_bookings pb
       LEFT JOIN LATERAL (
         SELECT total_pence, currency, sent_at
           FROM booking_offers
          WHERE provisional_booking_id = pb.id AND delivery_status = 'sent'
          ORDER BY sent_at DESC, id DESC
          LIMIT 1
       ) latest_offer ON TRUE
      ORDER BY pb.created_at DESC
      LIMIT $1`,
    [Math.max(1, Math.min(500, Math.round(limit)))],
  );
  return result.rows.map(normaliseBookingRow);
}

export async function getProvisionalBookingRequest(reference: string): Promise<ProvisionalBookingRequest | null> {
  const result = await getPool().query(
    `SELECT pb.id::text AS "internalId", pb.public_id::text AS reference,
            pb.property_id AS "propertyId", pb.arrival::text, pb.departure::text,
            pb.guests, pb.pets, pb.guest_name AS name, pb.guest_email AS email,
            pb.guest_telephone AS telephone, pb.guest_message AS message, pb.status,
            pb.pricing_plan_id::text AS "pricingPlanId", pp.name AS "pricingPlanName",
            pb.pricing_currency AS "pricingCurrency", pb.accommodation_pence AS "accommodationPence",
            pb.fees_pence AS "feesPence", pb.guest_total_pence AS "guestTotalPence",
            pb.pricing_plan_version AS "pricingPlanVersion", pb.pricing_input AS "pricingInput",
            pb.pricing_result AS "pricingResult", pb.quoted_at AS "quotedAt", pb.created_at AS "createdAt",
            latest_offer.total_pence AS "latestOfferTotalPence",
            latest_offer.currency AS "latestOfferCurrency",
            latest_offer.sent_at AS "latestOfferSentAt"
       FROM provisional_bookings pb
       LEFT JOIN pricing_plans pp ON pp.id = pb.pricing_plan_id
       LEFT JOIN LATERAL (
         SELECT total_pence, currency, sent_at
           FROM booking_offers
          WHERE provisional_booking_id = pb.id AND delivery_status = 'sent'
          ORDER BY sent_at DESC, id DESC
          LIMIT 1
       ) latest_offer ON TRUE
      WHERE pb.public_id = $1::uuid`,
    [reference],
  );
  return result.rowCount ? normaliseBookingRow(result.rows[0]) : null;
}

export async function updateProvisionalBookingEmail(reference: string, email: string): Promise<boolean> {
  const result = await getPool().query(
    `UPDATE provisional_bookings
        SET guest_email = $2
      WHERE public_id = $1::uuid`,
    [reference, email],
  );
  return Boolean(result.rowCount);
}

export async function deleteProvisionalBookingRequest(reference: string): Promise<boolean> {
  const result = await getPool().query(
    `DELETE FROM provisional_bookings
      WHERE public_id = $1::uuid
        AND status IN ('pending', 'offered')`,
    [reference],
  );
  return Boolean(result.rowCount);
}

function normaliseOfferRow(row: Record<string, any>): BookingOffer {
  return {
    id: String(row.id),
    publicId: String(row.publicId),
    currency: row.currency,
    lineItems: Array.isArray(row.lineItems) ? row.lineItems : [],
    totalPence: Number(row.totalPence),
    offerMessage: row.offerMessage,
    terms: row.terms,
    validUntil: row.validUntil,
    recipientEmail: row.recipientEmail,
    subject: row.subject,
    deliveryStatus: row.deliveryStatus,
    deliveryMessageId: row.deliveryMessageId,
    deliveryError: row.deliveryError,
    createdAt: new Date(row.createdAt).toISOString(),
    sentAt: row.sentAt ? new Date(row.sentAt).toISOString() : null,
    adminDisplayName: row.adminDisplayName,
  };
}

export async function getBookingOffers(reference: string): Promise<BookingOffer[]> {
  const result = await getPool().query(
    `SELECT bo.id, bo.public_id::text AS "publicId", bo.currency,
            bo.line_items AS "lineItems", bo.total_pence AS "totalPence",
            bo.offer_message AS "offerMessage", bo.terms, bo.valid_until::text AS "validUntil",
            bo.recipient_email AS "recipientEmail", bo.subject,
            bo.delivery_status AS "deliveryStatus", bo.delivery_message_id AS "deliveryMessageId",
            bo.delivery_error AS "deliveryError", bo.created_at AS "createdAt", bo.sent_at AS "sentAt",
            au.display_name AS "adminDisplayName"
       FROM booking_offers bo
       JOIN provisional_bookings pb ON pb.id = bo.provisional_booking_id
       LEFT JOIN admin_users au ON au.id = bo.admin_user_id
      WHERE pb.public_id = $1::uuid
      ORDER BY bo.created_at DESC, bo.id DESC`,
    [reference],
  );
  return result.rows.map(normaliseOfferRow);
}

export async function createBookingOfferAttempt(input: {
  reference: string;
  adminUserId: string;
  currency: string;
  lineItems: BookingOfferLine[];
  totalPence: number;
  offerMessage?: string;
  terms?: string;
  validUntil?: string;
  recipientEmail: string;
  subject: string;
}): Promise<{ id: string; publicId: string }> {
  const result = await getPool().query(
    `INSERT INTO booking_offers
       (provisional_booking_id, admin_user_id, currency, line_items, total_pence,
        offer_message, terms, valid_until, recipient_email, subject)
     SELECT pb.id, $2, $3, $4::jsonb, $5, $6, $7, $8::date, $9, $10
       FROM provisional_bookings pb
      WHERE pb.public_id = $1::uuid
      RETURNING id::text, public_id::text AS "publicId"`,
    [
      input.reference,
      input.adminUserId,
      input.currency,
      JSON.stringify(input.lineItems),
      input.totalPence,
      input.offerMessage || null,
      input.terms || null,
      input.validUntil || null,
      input.recipientEmail,
      input.subject,
    ],
  );
  if (!result.rowCount) throw new Error('BOOKING_NOT_FOUND');
  return result.rows[0];
}

export async function markBookingOfferSent(input: {
  offerId: string;
  reference: string;
  deliveryMessageId?: string | null;
}): Promise<void> {
  // Record provider acceptance first. If the subsequent booking-status update fails,
  // the audit trail must still show that an email was actually sent.
  await getPool().query(
    `UPDATE booking_offers
        SET delivery_status = 'sent', delivery_message_id = $2,
            delivery_error = NULL, sent_at = NOW()
      WHERE id = $1`,
    [input.offerId, input.deliveryMessageId || null],
  );
  await getPool().query(
    `UPDATE provisional_bookings SET status = 'offered'
      WHERE public_id = $1::uuid`,
    [input.reference],
  );
}

export async function markBookingOfferFailed(offerId: string, error: unknown): Promise<void> {
  await getPool().query(
    `UPDATE booking_offers
        SET delivery_status = 'failed', delivery_error = $2
      WHERE id = $1`,
    [offerId, error instanceof Error ? error.message.slice(0, 4000) : String(error).slice(0, 4000)],
  );
}

export async function getBookingReport(): Promise<{
  calendars: unknown[];
  provisionalRequests: unknown[];
}> {
  const pool = getPool();
  const calendars = await pool.query(
    `SELECT
       p.property_id AS "propertyId",
       p.last_attempt_at AS "lastAttemptAt",
       p.last_success_at AS "lastSuccessAt",
       p.last_error AS "lastError",
       COALESCE(p.imported_blocks, 0) AS "importedBlocks",
       COALESCE(p.feed_count, 0) AS "feedCount",
       MIN(b.starts_on)::text AS "firstBlockedDate",
       MAX(b.ends_on)::text AS "lastBlockedDate"
     FROM calendar_sync_status p
     LEFT JOIN booking_blocks b ON b.property_id = p.property_id AND b.source = 'airbnb'
     GROUP BY p.property_id, p.last_attempt_at, p.last_success_at, p.last_error, p.imported_blocks, p.feed_count
     ORDER BY p.property_id`,
  );
  const provisionalRequests = await pool.query(
    `SELECT
       public_id AS reference,
       property_id AS "propertyId",
       arrival::text,
       departure::text,
       guests,
       pets,
       guest_name AS name,
       guest_email AS email,
       guest_telephone AS telephone,
       guest_message AS message,
       status,
       pricing_currency AS "pricingCurrency",
       guest_total_pence AS "guestTotalPence",
       pricing_plan_version AS "pricingPlanVersion",
       quoted_at AS "quotedAt",
       created_at AS "createdAt"
     FROM provisional_bookings
     ORDER BY created_at DESC
     LIMIT 100`,
  );
  return { calendars: calendars.rows, provisionalRequests: provisionalRequests.rows };
}
