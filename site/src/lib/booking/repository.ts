import crypto from 'node:crypto';
import { getAvailabilityProperty, getPropertiesSharingAvailability, getProperty } from './config';
import { getPool } from './db';
import type { ImportedBlock } from './ical';
import type { PublishedPricingQuote } from '../pricing/types';
import type { PricingRule } from '../pricing/types';
import { customerPricingLinesFromUnknown } from '../pricing/display';
import { resolvePaymentTerms, type PaymentTermsSnapshot } from '../pricing/payment-terms';
import {
  botMessageForActivity,
  insertAdministratorOfferMessage,
  insertBotBookingMessage,
} from './messaging';
import {
  hasBookingDateConflict,
  queryAdminCalendarEntries,
  queryBookingBlocks,
  queryProvisionalBookingRequestRows,
  type AdminCalendarEntry,
  type BookingBlock,
} from './status-calendar';

export type { AdminCalendarEntry, BookingBlock } from './status-calendar';

export async function expireElapsedBookingOffers(): Promise<number> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const expired = await client.query(
      `UPDATE booking_offers
          SET customer_status = 'expired', expired_at = COALESCE(expired_at, NOW())
        WHERE published_at IS NOT NULL
          AND customer_status = 'active'
          AND valid_until IS NOT NULL
          AND valid_until < CURRENT_DATE
      RETURNING id, provisional_booking_id`,
    );
    for (const row of expired.rows) {
      await client.query(
        `UPDATE provisional_bookings
            SET status = 'expired'
          WHERE id = $1 AND status = 'offered'`,
        [row.provisional_booking_id],
      );
      await client.query(
        `INSERT INTO booking_activity
           (provisional_booking_id, booking_offer_id, actor, event_type)
         VALUES ($1, $2, 'system', 'offer_expired')`,
        [row.provisional_booking_id, row.id],
      );
      await insertBotBookingMessage(client, {
        bookingId: row.provisional_booking_id,
        offerId: row.id,
        body: 'The booking offer has expired. Send a message if you would like Olrig Bank to reconsider the stay.',
        audience: 'both',
        sourceKey: `offer-expired:${row.id}`,
      });
    }
    await client.query('COMMIT');
    return expired.rowCount || 0;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

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
  await expireElapsedBookingOffers();
  const property = getProperty(propertyId);
  const availabilityProperty = property ? getAvailabilityProperty(property) : undefined;
  if (!property || !availabilityProperty) throw new Error(`Unknown booking property: ${propertyId}`);
  const linkedPropertyIds = getPropertiesSharingAvailability(property).map((candidate) => candidate.id);

  return queryBookingBlocks(getPool(), {
    availabilityPropertyId: availabilityProperty.id,
    propertyIds: linkedPropertyIds,
    from,
    to,
  });
}

export async function getAdminCalendarEntries(from: string, to: string): Promise<AdminCalendarEntry[]> {
  await expireElapsedBookingOffers();
  return queryAdminCalendarEntries(getPool(), from, to);
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
  telephoneE164?: string | null;
  whatsappConsentRequested?: boolean;
  whatsappConsentVersion?: string | null;
  message?: string;
  pricingQuote?: PublishedPricingQuote | null;
}): Promise<{ reference: string; accessToken: string }> {
  await expireElapsedBookingOffers();
  const property = getProperty(input.propertyId);
  const availabilityProperty = property ? getAvailabilityProperty(property) : undefined;
  if (!property || !availabilityProperty) throw new Error(`Unknown booking property: ${input.propertyId}`);
  const linkedPropertyIds = getPropertiesSharingAvailability(property).map((candidate) => candidate.id);
  const accessToken = crypto.randomBytes(32).toString('base64url');

  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [availabilityProperty.id]);
    const conflict = await hasBookingDateConflict(client, {
      availabilityPropertyId: availabilityProperty.id,
      propertyIds: linkedPropertyIds,
      arrival: input.arrival,
      departure: input.departure,
    });
    if (conflict) throw new Error('DATES_UNAVAILABLE');
    const result = await client.query(
      `INSERT INTO provisional_bookings
       (property_id, arrival, departure, guests, pets, guest_name, guest_email, guest_telephone, guest_telephone_e164,
        whatsapp_consent_status, whatsapp_consent_at, whatsapp_consent_source, whatsapp_consent_version,
        whatsapp_consent_number_e164, guest_message,
        pricing_plan_id, pricing_plan_version, pricing_currency, accommodation_pence, fees_pence,
        guest_total_pence, channel_commission_pence, owner_revenue_pence, pricing_input, pricing_result, quoted_at,
        customer_access_token)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
        CASE WHEN $10 = 'active' THEN NOW() END, $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23::jsonb,$24::jsonb,$25,$26)
       RETURNING id::text, public_id::text AS reference`,
      [
        input.propertyId, input.arrival, input.departure, input.guests, input.pets, input.name, input.email,
        input.telephone || null, input.telephoneE164 || null,
        input.whatsappConsentRequested ? 'active' : 'not_requested',
        input.whatsappConsentRequested ? 'booking_form' : null,
        input.whatsappConsentRequested ? input.whatsappConsentVersion || null : null,
        input.whatsappConsentRequested ? input.telephoneE164 || null : null,
        input.message || null,
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
        accessToken,
      ],
    );
    await client.query(
      `INSERT INTO booking_activity (provisional_booking_id, actor, event_type)
       VALUES ($1, 'customer', 'booking_requested')`,
      [result.rows[0].id],
    );
    if (input.message?.trim()) {
      await client.query(
        `INSERT INTO booking_messages (
           provisional_booking_id, sender_type, sender_name, message_type, body,
           source_key, booker_read_at, admin_read_at
         ) VALUES ($1, 'booker', $2, 'message', $3, $4, NOW(), NULL)
         ON CONFLICT (source_key) DO NOTHING`,
        [result.rows[0].id, input.name, input.message.trim(), `request-message:${result.rows[0].id}`],
      );
    }
    await insertBotBookingMessage(client, {
      bookingId: result.rows[0].id,
      body: 'Your booking request has been received. Jenna will review the dates and price, and any update will appear in this conversation.',
      audience: 'booker',
      sourceKey: `request-received:${result.rows[0].id}`,
    });
    await client.query('COMMIT');
    return { reference: result.rows[0].reference, accessToken };
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
  deliveryStatus: 'pending' | 'sent' | 'failed' | 'not_requested';
  deliveryMessageId: string | null;
  deliveryError: string | null;
  createdAt: string;
  sentAt: string | null;
  adminDisplayName: string | null;
  customerStatus: 'pending' | 'active' | 'accepted' | 'declined' | 'expired' | 'superseded';
  firstViewedAt: string | null;
  acceptedAt: string | null;
  declinedAt: string | null;
  expiredAt: string | null;
};

export type ProvisionalBookingRequest = {
  internalId?: string;
  reference: string;
  customerAccessToken?: string;
  propertyId: string;
  arrival: string;
  departure: string;
  guests: number;
  pets: number;
  name: string;
  email: string;
  telephone: string | null;
  telephoneE164: string | null;
  whatsappConsentStatus: 'not_requested' | 'active' | 'withdrawn';
  whatsappConsentAt: string | null;
  whatsappConsentWithdrawnAt: string | null;
  whatsappConsentSource: string | null;
  whatsappConsentVersion: string | null;
  whatsappConsentNumberE164: string | null;
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
  depositPence?: number;
  depositDueAt?: string | null;
  balanceDuePence?: number;
  balanceDueOn?: string | null;
  paymentTermsSnapshot?: PaymentTermsSnapshot | null;
  currentPaymentPublicId?: string | null;
  currentPaymentStage?: 'deposit' | 'balance' | 'full_payment' | null;
  currentPaymentStatus?: 'reported' | 'verified' | 'rejected' | 'cancelled' | null;
  depositVerified?: boolean;
  balanceVerified?: boolean;
  fullPaymentVerified?: boolean;
  createdAt: string;
  latestOfferTotalPence: number | null;
  latestOfferCurrency: string | null;
  latestOfferSentAt: string | null;
  unreadMessageCount: number;
};

function normaliseBookingRow(row: Record<string, any>): ProvisionalBookingRequest {
  return {
    ...row,
    quotedAt: row.quotedAt ? new Date(row.quotedAt).toISOString() : null,
    telephoneE164: row.telephoneE164 || null,
    whatsappConsentStatus: row.whatsappConsentStatus || 'not_requested',
    whatsappConsentAt: row.whatsappConsentAt ? new Date(row.whatsappConsentAt).toISOString() : null,
    whatsappConsentWithdrawnAt: row.whatsappConsentWithdrawnAt ? new Date(row.whatsappConsentWithdrawnAt).toISOString() : null,
    whatsappConsentSource: row.whatsappConsentSource || null,
    whatsappConsentVersion: row.whatsappConsentVersion || null,
    whatsappConsentNumberE164: row.whatsappConsentNumberE164 || null,
    depositPence: Number(row.depositPence || 0),
    depositDueAt: row.depositDueAt ? new Date(row.depositDueAt).toISOString() : null,
    balanceDuePence: Number(row.balanceDuePence || 0),
    balanceDueOn: row.balanceDueOn || null,
    currentPaymentPublicId: row.currentPaymentPublicId || null,
    currentPaymentStage: row.currentPaymentStage || null,
    currentPaymentStatus: row.currentPaymentStatus || null,
    depositVerified: Boolean(row.depositVerified),
    balanceVerified: Boolean(row.balanceVerified),
    fullPaymentVerified: Boolean(row.fullPaymentVerified),
    createdAt: new Date(row.createdAt).toISOString(),
    latestOfferSentAt: row.latestOfferSentAt ? new Date(row.latestOfferSentAt).toISOString() : null,
    unreadMessageCount: Number(row.unreadMessageCount || 0),
  } as ProvisionalBookingRequest;
}

export async function getProvisionalBookingRequests(
  limit = 100,
  includeInactive = false,
): Promise<ProvisionalBookingRequest[]> {
  await expireElapsedBookingOffers();
  const rows = await queryProvisionalBookingRequestRows(getPool(), limit, includeInactive);
  return rows.map(normaliseBookingRow);
}

export async function getProvisionalBookingRequest(reference: string): Promise<ProvisionalBookingRequest | null> {
  await expireElapsedBookingOffers();
  const result = await getPool().query(
    `SELECT pb.id::text AS "internalId", pb.public_id::text AS reference,
            pb.customer_access_token AS "customerAccessToken", pb.property_id AS "propertyId", pb.arrival::text, pb.departure::text,
            pb.guests, pb.pets, pb.guest_name AS name, pb.guest_email AS email,
            pb.guest_telephone AS telephone, pb.guest_telephone_e164 AS "telephoneE164",
            pb.whatsapp_consent_status AS "whatsappConsentStatus",
            pb.whatsapp_consent_at AS "whatsappConsentAt",
            pb.whatsapp_consent_withdrawn_at AS "whatsappConsentWithdrawnAt",
            pb.whatsapp_consent_source AS "whatsappConsentSource",
            pb.whatsapp_consent_version AS "whatsappConsentVersion",
            pb.whatsapp_consent_number_e164 AS "whatsappConsentNumberE164",
            pb.guest_message AS message, pb.status,
            pb.pricing_plan_id::text AS "pricingPlanId", pp.name AS "pricingPlanName",
            pb.pricing_currency AS "pricingCurrency", pb.accommodation_pence AS "accommodationPence",
            pb.fees_pence AS "feesPence", pb.guest_total_pence AS "guestTotalPence",
            pb.pricing_plan_version AS "pricingPlanVersion", pb.pricing_input AS "pricingInput",
            pb.pricing_result AS "pricingResult", pb.quoted_at AS "quotedAt",
            pb.deposit_pence AS "depositPence", pb.deposit_due_at AS "depositDueAt",
            pb.balance_due_pence AS "balanceDuePence", pb.balance_due_on::text AS "balanceDueOn",
            pb.payment_terms_snapshot AS "paymentTermsSnapshot", pb.created_at AS "createdAt",
            payment_summary."currentPaymentPublicId", payment_summary."currentPaymentStage",
            payment_summary."currentPaymentStatus", payment_summary."depositVerified",
            payment_summary."balanceVerified", payment_summary."fullPaymentVerified",
            latest_offer.total_pence AS "latestOfferTotalPence",
            latest_offer.currency AS "latestOfferCurrency",
            latest_offer.sent_at AS "latestOfferSentAt",
            (SELECT COUNT(*)::int FROM booking_messages bm
              WHERE bm.provisional_booking_id = pb.id AND bm.admin_read_at IS NULL) AS "unreadMessageCount"
       FROM provisional_bookings pb
       LEFT JOIN pricing_plans pp ON pp.id = pb.pricing_plan_id
       LEFT JOIN LATERAL (
         SELECT total_pence, currency, sent_at
           FROM booking_offers
          WHERE provisional_booking_id = pb.id AND published_at IS NOT NULL
          ORDER BY published_at DESC, id DESC
          LIMIT 1
       ) latest_offer ON TRUE
       LEFT JOIN LATERAL (
         SELECT
           (ARRAY_AGG(bp.public_id::text ORDER BY bp.reported_at DESC, bp.id DESC)
             FILTER (WHERE bp.status = 'reported'))[1] AS "currentPaymentPublicId",
           (ARRAY_AGG(bp.stage ORDER BY bp.reported_at DESC, bp.id DESC)
             FILTER (WHERE bp.status = 'reported'))[1] AS "currentPaymentStage",
           (ARRAY_AGG(bp.status ORDER BY bp.reported_at DESC, bp.id DESC))[1] AS "currentPaymentStatus",
           BOOL_OR(bp.stage = 'deposit' AND bp.status = 'verified') AS "depositVerified",
           BOOL_OR(bp.stage = 'balance' AND bp.status = 'verified') AS "balanceVerified",
           BOOL_OR(bp.stage = 'full_payment' AND bp.status = 'verified') AS "fullPaymentVerified"
         FROM booking_payments bp WHERE bp.provisional_booking_id = pb.id
       ) payment_summary ON TRUE
      WHERE pb.public_id = $1::uuid`,
    [reference],
  );
  return result.rowCount ? normaliseBookingRow(result.rows[0]) : null;
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

export async function withdrawProvisionalBookingWhatsAppConsent(reference: string, _source: 'booker' | 'administrator'): Promise<boolean> {
  const result = await getPool().query(
    `UPDATE provisional_bookings
        SET whatsapp_consent_status = 'withdrawn', whatsapp_consent_withdrawn_at = NOW()
      WHERE public_id = $1::uuid AND whatsapp_consent_status = 'active'
      RETURNING id`,
    [reference],
  );
  return Boolean(result.rowCount);
}

export async function deleteProductionAcceptanceTestBooking(
  reference: string,
  confirmedReference: string,
): Promise<boolean> {
  if (reference !== confirmedReference || !/^[0-9a-f-]{36}$/i.test(reference)) return false;
  const result = await getPool().query(
    `DELETE FROM provisional_bookings
      WHERE public_id = $1::uuid
        AND guest_name LIKE 'Production Acceptance Test%'
        AND status IN ('payment_pending', 'payment_reported', 'confirmed', 'approved', 'cancelled')`,
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
    customerStatus: row.customerStatus,
    firstViewedAt: row.firstViewedAt ? new Date(row.firstViewedAt).toISOString() : null,
    acceptedAt: row.acceptedAt ? new Date(row.acceptedAt).toISOString() : null,
    declinedAt: row.declinedAt ? new Date(row.declinedAt).toISOString() : null,
    expiredAt: row.expiredAt ? new Date(row.expiredAt).toISOString() : null,
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
            au.display_name AS "adminDisplayName", bo.customer_status AS "customerStatus",
            bo.first_viewed_at AS "firstViewedAt", bo.accepted_at AS "acceptedAt",
            bo.declined_at AS "declinedAt", bo.expired_at AS "expiredAt"
       FROM booking_offers bo
       JOIN provisional_bookings pb ON pb.id = bo.provisional_booking_id
       LEFT JOIN admin_users au ON au.id = bo.admin_user_id
      WHERE pb.public_id = $1::uuid
      ORDER BY bo.created_at DESC, bo.id DESC`,
    [reference],
  );
  return result.rows.map(normaliseOfferRow);
}

function accessTokenHash(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function validAccessToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43,128}$/.test(token);
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
  emailRequested: boolean;
}): Promise<{ id: string; publicId: string; accessToken: string }> {
  const accessToken = crypto.randomBytes(32).toString('base64url');
  const result = await getPool().query(
    `INSERT INTO booking_offers
       (provisional_booking_id, admin_user_id, currency, line_items, total_pence,
        offer_message, terms, valid_until, recipient_email, subject, access_token_hash, delivery_status)
     SELECT pb.id, $2, $3, $4::jsonb, $5, $6, $7, $8::date, $9, $10, $11,
            CASE WHEN $12::boolean THEN 'pending' ELSE 'not_requested' END
       FROM provisional_bookings pb
      WHERE pb.public_id = $1::uuid
        AND pb.status IN ('pending', 'offered')
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
      accessTokenHash(accessToken),
      input.emailRequested,
    ],
  );
  if (!result.rowCount) throw new Error('BOOKING_NOT_FOUND');
  return { ...result.rows[0], accessToken };
}

export async function publishBookingOffer(input: {
  offerId: string;
  reference: string;
}): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const selected = await client.query(
      `SELECT bo.provisional_booking_id, bo.offer_message, bo.admin_user_id,
              COALESCE(NULLIF(au.display_name, ''), 'Jenna') AS admin_display_name,
              pb.status AS booking_status
         FROM booking_offers bo
         JOIN provisional_bookings pb ON pb.id = bo.provisional_booking_id
         LEFT JOIN admin_users au ON au.id = bo.admin_user_id
        WHERE bo.id = $1 AND pb.public_id = $2::uuid
        FOR UPDATE OF bo, pb`,
      [input.offerId, input.reference],
    );
    if (!selected.rowCount) throw new Error('BOOKING_OFFER_NOT_FOUND');
    const row = selected.rows[0];
    const bookingId = row.provisional_booking_id;
    if (!['pending', 'offered'].includes(row.booking_status)) {
      throw new Error('BOOKING_CANNOT_BE_OFFERED');
    }

    await client.query(
      `UPDATE booking_offers
          SET customer_status = 'superseded', token_revoked_at = COALESCE(token_revoked_at, NOW())
        WHERE provisional_booking_id = $1 AND id <> $2 AND customer_status = 'active'`,
      [bookingId, input.offerId],
    );
    await client.query(
      `UPDATE booking_offers
          SET published_at = NOW(), customer_status = 'active'
        WHERE id = $1`,
      [input.offerId],
    );
    await client.query(
      `UPDATE provisional_bookings SET status = 'offered'
        WHERE id = $1 AND status IN ('pending', 'offered')`,
      [bookingId],
    );
    await client.query(
      `INSERT INTO booking_activity
         (provisional_booking_id, booking_offer_id, actor, event_type)
       VALUES ($1, $2, 'administrator', 'offer_published')`,
      [bookingId, input.offerId],
    );
    await insertAdministratorOfferMessage(client, {
      bookingId,
      offerId: input.offerId,
      adminUserId: row.admin_user_id,
      adminDisplayName: row.admin_display_name,
      body: String(row.offer_message || ''),
    });
    await insertBotBookingMessage(client, {
      bookingId,
      offerId: input.offerId,
      body: 'A booking offer has been published. Open Reservation details to review the price, terms and response options.',
      audience: 'booker',
      sourceKey: `offer-published:${input.offerId}`,
    });
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function markBookingOfferSent(input: {
  offerId: string;
  reference: string;
  deliveryMessageId?: string | null;
}): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const sent = await client.query(
      `UPDATE booking_offers bo
          SET delivery_status = 'sent', delivery_message_id = $3,
              delivery_error = NULL, sent_at = NOW()
         FROM provisional_bookings pb
        WHERE bo.id = $1
          AND pb.id = bo.provisional_booking_id
          AND pb.public_id = $2::uuid
      RETURNING bo.provisional_booking_id, bo.id`,
      [input.offerId, input.reference, input.deliveryMessageId || null],
    );
    if (sent.rowCount) {
      const row = sent.rows[0];
      await client.query(
        `INSERT INTO booking_activity
           (provisional_booking_id, booking_offer_id, actor, event_type, details)
         VALUES ($1, $2, 'system', 'offer_email_sent', $3::jsonb)`,
        [row.provisional_booking_id, row.id, JSON.stringify({ deliveryMessageId: input.deliveryMessageId || null })],
      );
      await insertBotBookingMessage(client, {
        bookingId: row.provisional_booking_id,
        offerId: row.id,
        body: 'The optional email copy of the booking offer was sent successfully.',
        audience: 'booker',
        sourceKey: `offer-email-sent:${row.id}`,
      });
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function markBookingOfferFailed(offerId: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message.slice(0, 4000) : String(error).slice(0, 4000);
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const failed = await client.query(
      `UPDATE booking_offers
          SET delivery_status = 'failed', delivery_error = $2
        WHERE id = $1
      RETURNING provisional_booking_id, id`,
      [offerId, message],
    );
    if (failed.rowCount) {
      const row = failed.rows[0];
      await client.query(
        `INSERT INTO booking_activity
           (provisional_booking_id, booking_offer_id, actor, event_type, details)
         VALUES ($1, $2, 'system', 'offer_email_failed', $3::jsonb)`,
        [row.provisional_booking_id, row.id, JSON.stringify({ error: message })],
      );
      await insertBotBookingMessage(client, {
        bookingId: row.provisional_booking_id,
        offerId: row.id,
        body: 'The booking offer remains available here, but its optional email copy could not be sent.',
        audience: 'booker',
        sourceKey: `offer-email-failed:${row.id}`,
      });
    }
    await client.query('COMMIT');
  } catch (transactionError) {
    await client.query('ROLLBACK');
    throw transactionError;
  } finally {
    client.release();
  }
}

export type CustomerBookingOffer = {
  offerId: string | null;
  offerReference: string | null;
  bookingReference: string;
  propertyId: string;
  arrival: string;
  departure: string;
  guests: number;
  pets: number;
  guestName: string;
  guestEmail: string;
  guestTelephone: string | null;
  telephoneE164: string | null;
  whatsappConsentStatus: 'not_requested' | 'active' | 'withdrawn';
  whatsappConsentAt: string | null;
  whatsappConsentWithdrawnAt: string | null;
  guestMessage: string | null;
  bookingStatus: string;
  requestCreatedAt: string;
  priceAvailable: boolean;
  currency: string;
  lineItems: BookingOfferLine[];
  totalPence: number;
  offerMessage: string | null;
  terms: string | null;
  validUntil: string | null;
  subject: string | null;
  customerStatus: 'request_pending' | 'pending' | 'active' | 'accepted' | 'declined' | 'expired' | 'superseded' | 'cancelled';
  sentAt: string | null;
  publishedAt: string | null;
  firstViewedAt: string | null;
  acceptedAt: string | null;
  declinedAt: string | null;
  expiredAt: string | null;
  tokenRevokedAt: string | null;
  paymentMethod: 'gocardless' | 'stripe' | 'bank_transfer' | null;
  depositPence: number;
  depositDueAt: string | null;
  balanceDuePence: number;
  balanceDueOn: string | null;
  paymentReportedAt: string | null;
  paymentReceivedAt: string | null;
};

function normaliseCustomerBooking(row: Record<string, any>): CustomerBookingOffer {
  const offerLines = Array.isArray(row.lineItems) ? row.lineItems : [];
  const recordedLines = customerPricingLinesFromUnknown(row.recordedPricingResult)
    .map(({ label, detail, amountPence }) => ({ label, detail, amountPence }));
  const lineItems = offerLines.length ? offerLines : recordedLines;
  const recordedTotal = row.recordedTotalPence == null ? null : Number(row.recordedTotalPence);
  const offerTotal = row.totalPence == null ? null : Number(row.totalPence);

  return {
    offerId: row.offerId == null ? null : String(row.offerId),
    offerReference: row.offerReference == null ? null : String(row.offerReference),
    bookingReference: String(row.bookingReference),
    propertyId: row.propertyId,
    arrival: row.arrival,
    departure: row.departure,
    guests: Number(row.guests),
    pets: Number(row.pets || 0),
    guestName: row.guestName,
    guestEmail: row.guestEmail || '',
    guestTelephone: row.guestTelephone,
    telephoneE164: row.telephoneE164 || null,
    whatsappConsentStatus: row.whatsappConsentStatus || 'not_requested',
    whatsappConsentAt: row.whatsappConsentAt ? new Date(row.whatsappConsentAt).toISOString() : null,
    whatsappConsentWithdrawnAt: row.whatsappConsentWithdrawnAt ? new Date(row.whatsappConsentWithdrawnAt).toISOString() : null,
    guestMessage: row.guestMessage,
    bookingStatus: row.bookingStatus,
    requestCreatedAt: new Date(row.requestCreatedAt).toISOString(),
    priceAvailable: offerTotal !== null || recordedTotal !== null || lineItems.length > 0,
    currency: row.currency || row.recordedCurrency || 'GBP',
    lineItems,
    totalPence: offerTotal ?? recordedTotal ?? lineItems.reduce((sum, line) => sum + Number(line.amountPence || 0), 0),
    offerMessage: row.offerMessage,
    terms: row.terms,
    validUntil: row.validUntil,
    subject: row.subject,
    customerStatus: row.customerStatus,
    sentAt: row.sentAt ? new Date(row.sentAt).toISOString() : null,
    publishedAt: row.publishedAt ? new Date(row.publishedAt).toISOString() : null,
    firstViewedAt: row.firstViewedAt ? new Date(row.firstViewedAt).toISOString() : null,
    acceptedAt: row.acceptedAt ? new Date(row.acceptedAt).toISOString() : null,
    declinedAt: row.declinedAt ? new Date(row.declinedAt).toISOString() : null,
    expiredAt: row.expiredAt ? new Date(row.expiredAt).toISOString() : null,
    tokenRevokedAt: row.tokenRevokedAt ? new Date(row.tokenRevokedAt).toISOString() : null,
    paymentMethod: row.paymentMethod || null,
    depositPence: Number(row.depositPence || 0),
    depositDueAt: row.depositDueAt ? new Date(row.depositDueAt).toISOString() : null,
    balanceDuePence: Number(row.balanceDuePence || 0),
    balanceDueOn: row.balanceDueOn || null,
    paymentReportedAt: row.paymentReportedAt ? new Date(row.paymentReportedAt).toISOString() : null,
    paymentReceivedAt: row.paymentReceivedAt ? new Date(row.paymentReceivedAt).toISOString() : null,
  };
}

const customerBookingSelect = `
  SELECT bo.id::text AS "offerId", bo.public_id::text AS "offerReference",
         pb.public_id::text AS "bookingReference", pb.property_id AS "propertyId",
         pb.arrival::text, pb.departure::text, pb.guests, pb.pets,
         pb.guest_name AS "guestName", pb.guest_email AS "guestEmail",
         pb.guest_telephone AS "guestTelephone", pb.guest_telephone_e164 AS "telephoneE164",
         pb.whatsapp_consent_status AS "whatsappConsentStatus",
         pb.whatsapp_consent_at AS "whatsappConsentAt",
         pb.whatsapp_consent_withdrawn_at AS "whatsappConsentWithdrawnAt",
         pb.guest_message AS "guestMessage",
         pb.status AS "bookingStatus", pb.created_at AS "requestCreatedAt",
         pb.payment_method AS "paymentMethod", pb.deposit_pence AS "depositPence",
         pb.deposit_due_at AS "depositDueAt", pb.balance_due_pence AS "balanceDuePence",
         pb.balance_due_on::text AS "balanceDueOn",
         pb.payment_reported_at AS "paymentReportedAt", pb.payment_received_at AS "paymentReceivedAt",
         pb.pricing_currency AS "recordedCurrency", pb.guest_total_pence AS "recordedTotalPence",
         pb.pricing_result AS "recordedPricingResult",
         bo.currency, bo.line_items AS "lineItems", bo.total_pence AS "totalPence",
         bo.offer_message AS "offerMessage", bo.terms, bo.valid_until::text AS "validUntil",
         bo.subject,
         CASE WHEN pb.status = 'cancelled' THEN 'cancelled'
              WHEN pb.status = 'declined' THEN 'declined'
              WHEN pb.status = 'expired' THEN 'expired'
              ELSE COALESCE(bo.customer_status, 'request_pending')
         END AS "customerStatus",
         bo.sent_at AS "sentAt", bo.published_at AS "publishedAt",
         bo.first_viewed_at AS "firstViewedAt", bo.accepted_at AS "acceptedAt",
         bo.declined_at AS "declinedAt", bo.expired_at AS "expiredAt",
         bo.token_revoked_at AS "tokenRevokedAt"
    FROM provisional_bookings pb
    LEFT JOIN LATERAL (
      SELECT candidate.*
        FROM booking_offers candidate
       WHERE candidate.provisional_booking_id = pb.id
         AND candidate.published_at IS NOT NULL
       ORDER BY candidate.published_at DESC, candidate.id DESC
       LIMIT 1
    ) bo ON TRUE`;

export async function getCustomerBookingPage(token: string, recordView = true): Promise<CustomerBookingOffer | null> {
  if (!validAccessToken(token)) return null;
  await expireElapsedBookingOffers();
  const tokenHash = accessTokenHash(token);

  if (recordView) {
    await getPool().query(
      `WITH resolved AS (
         SELECT id FROM provisional_bookings WHERE customer_access_token = $1
         UNION
         SELECT provisional_booking_id FROM booking_offers WHERE access_token_hash = $2
       ), first_view AS (
         UPDATE provisional_bookings pb
            SET customer_first_viewed_at = NOW()
           FROM resolved r
          WHERE pb.id = r.id AND pb.customer_first_viewed_at IS NULL
          RETURNING pb.id
       )
       INSERT INTO booking_activity (provisional_booking_id, actor, event_type)
       SELECT id, 'customer', 'booking_page_first_viewed' FROM first_view`,
      [token, tokenHash],
    );
    await getPool().query(
      `WITH resolved AS (
         SELECT id FROM provisional_bookings WHERE customer_access_token = $1
         UNION
         SELECT provisional_booking_id FROM booking_offers WHERE access_token_hash = $2
       ), current_offer AS (
         SELECT bo.id
           FROM booking_offers bo
           JOIN resolved r ON r.id = bo.provisional_booking_id
          WHERE bo.published_at IS NOT NULL
          ORDER BY bo.published_at DESC, bo.id DESC
          LIMIT 1
       ), first_offer_view AS (
         UPDATE booking_offers bo
            SET first_viewed_at = NOW()
           FROM current_offer current
          WHERE bo.id = current.id AND bo.first_viewed_at IS NULL
          RETURNING bo.id, bo.provisional_booking_id
       )
       INSERT INTO booking_activity
         (provisional_booking_id, booking_offer_id, actor, event_type)
       SELECT provisional_booking_id, id, 'customer', 'offer_viewed'
         FROM first_offer_view`,
      [token, tokenHash],
    );
  }

  const resolved = await getPool().query(
    `SELECT pb.public_id::text AS reference
       FROM provisional_bookings pb
      WHERE pb.customer_access_token = $1
     UNION
     SELECT pb.public_id::text AS reference
       FROM booking_offers bo
       JOIN provisional_bookings pb ON pb.id = bo.provisional_booking_id
      WHERE bo.access_token_hash = $2
     LIMIT 1`,
    [token, tokenHash],
  );
  if (!resolved.rowCount) return null;

  return getCustomerBookingPageByReference(resolved.rows[0].reference);
}

// Compatibility name for older callers and links.
export const getCustomerBookingOffer = getCustomerBookingPage;

export async function getCustomerBookingPageByReference(reference: string): Promise<CustomerBookingOffer | null> {
  await expireElapsedBookingOffers();
  const result = await getPool().query(
    customerBookingSelect + '\nWHERE pb.public_id = $1::uuid',
    [reference],
  );
  return result.rowCount ? normaliseCustomerBooking(result.rows[0]) : null;
}

export async function getConfirmedCustomerBooking(reference: string): Promise<CustomerBookingOffer | null> {
  const booking = await getCustomerBookingPageByReference(reference);
  return booking && (booking.bookingStatus === 'confirmed' || booking.bookingStatus === 'approved') ? booking : null;
}

export type CustomerOfferResponseResult =
  | 'accepted'
  | 'declined'
  | 'already_accepted'
  | 'already_declined'
  | 'expired'
  | 'superseded'
  | 'dates_unavailable'
  | 'not_found';

export async function respondToCustomerBookingOffer(
  token: string,
  response: 'accept' | 'decline',
): Promise<CustomerOfferResponseResult> {
  if (!validAccessToken(token)) return 'not_found';
  const tokenHash = accessTokenHash(token);
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const selected = await client.query(
      `WITH resolved AS (
         SELECT id FROM provisional_bookings WHERE customer_access_token = $1
         UNION
         SELECT provisional_booking_id FROM booking_offers WHERE access_token_hash = $2
       )
       SELECT bo.id, bo.provisional_booking_id, bo.customer_status,
              bo.valid_until IS NOT NULL AND bo.valid_until < CURRENT_DATE AS expired,
              bo.token_revoked_at,
              pb.public_id::text AS booking_reference, pb.property_id,
              pb.arrival::text, pb.departure::text, pb.status AS booking_status,
              bo.total_pence AS offer_total_pence,
              COALESCE(
                pb.pricing_plan_id,
                (SELECT id
                   FROM pricing_plans
                  WHERE property_id = pb.property_id AND status = 'published'
                  LIMIT 1)
              ) AS payment_terms_plan_id
         FROM provisional_bookings pb
         JOIN resolved r ON r.id = pb.id
         JOIN booking_offers bo ON bo.id = (
           SELECT candidate.id
             FROM booking_offers candidate
            WHERE candidate.provisional_booking_id = pb.id
              AND candidate.published_at IS NOT NULL
            ORDER BY candidate.published_at DESC, candidate.id DESC
            LIMIT 1
         )
        FOR UPDATE OF bo, pb`,
      [token, tokenHash],
    );
    if (!selected.rowCount) {
      await client.query('ROLLBACK');
      return 'not_found';
    }
    const row = selected.rows[0];

    if (row.customer_status === 'accepted') {
      await client.query('ROLLBACK');
      return 'already_accepted';
    }
    if (row.customer_status === 'declined') {
      await client.query('ROLLBACK');
      return 'already_declined';
    }
    if (row.customer_status === 'superseded' || row.token_revoked_at) {
      await client.query('ROLLBACK');
      return 'superseded';
    }
    if (row.expired || row.customer_status === 'expired') {
      if (row.customer_status === 'active') {
        await client.query(
          `UPDATE booking_offers
              SET customer_status = 'expired', expired_at = COALESCE(expired_at, NOW())
            WHERE id = $1`,
          [row.id],
        );
        await client.query(
          `UPDATE provisional_bookings SET status = 'expired'
            WHERE id = $1 AND status = 'offered'`,
          [row.provisional_booking_id],
        );
        await client.query(
          `INSERT INTO booking_activity
             (provisional_booking_id, booking_offer_id, actor, event_type)
           VALUES ($1, $2, 'system', 'offer_expired')`,
          [row.provisional_booking_id, row.id],
        );
        await insertBotBookingMessage(client, {
          bookingId: row.provisional_booking_id,
          offerId: row.id,
          body: 'The booking offer has expired. Send a message if you would like Olrig Bank to reconsider the stay.',
          audience: 'both',
          sourceKey: `offer-expired:${row.id}`,
        });
        await client.query('COMMIT');
      } else {
        await client.query('ROLLBACK');
      }
      return 'expired';
    }
    if (row.customer_status !== 'active' || row.booking_status !== 'offered') {
      await client.query('ROLLBACK');
      return 'superseded';
    }

    if (response === 'accept') {
      const property = getProperty(row.property_id);
      const availabilityProperty = property ? getAvailabilityProperty(property) : undefined;
      if (!property || !availabilityProperty) throw new Error(`Unknown booking property: ${row.property_id}`);
      const linkedPropertyIds = getPropertiesSharingAvailability(property).map((candidate) => candidate.id);
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [availabilityProperty.id]);
      const conflict = await hasBookingDateConflict(client, {
        availabilityPropertyId: availabilityProperty.id,
        propertyIds: linkedPropertyIds,
        arrival: row.arrival,
        departure: row.departure,
        excludeBookingId: row.provisional_booking_id,
      });
      if (conflict) {
        await client.query(
          `INSERT INTO booking_activity
             (provisional_booking_id, booking_offer_id, actor, event_type)
           VALUES ($1, $2, 'customer', 'offer_acceptance_blocked_by_availability')`,
          [row.provisional_booking_id, row.id],
        );
        await client.query('COMMIT');
        return 'dates_unavailable';
      }

      if (!row.payment_terms_plan_id) {
        throw new Error('PAYMENT_TERMS_PRICING_PLAN_REQUIRED');
      }
      const paymentTermRows = await client.query(
        `SELECT r.id::text, r.plan_id::text AS "planId",
                r.rule_definition_id::text AS "ruleDefinitionId",
                r.type, r.name, r.position, r.priority, r.enabled, r.stackable,
                r.stacking_group AS "stackingGroup", r.conditions, r.action,
                p.version AS "planVersion"
           FROM pricing_rules r
           JOIN pricing_plans p ON p.id = r.plan_id
          WHERE r.plan_id = $1
            AND r.type IN ('deposit_percentage', 'initial_payment_deadline', 'balance_payment_deadline')
          ORDER BY r.position, r.priority DESC, r.id`,
        [row.payment_terms_plan_id],
      );
      const acceptedAt = new Date();
      const paymentTerms = resolvePaymentTerms({
        rules: paymentTermRows.rows as PricingRule[],
        pricingPlanId: String(row.payment_terms_plan_id),
        pricingPlanVersion: Number(paymentTermRows.rows[0]?.planVersion),
        totalPence: Number(row.offer_total_pence),
        acceptedAt,
        arrival: row.arrival,
      });

      await client.query(
        `UPDATE booking_offers SET customer_status = 'accepted', accepted_at = $2 WHERE id = $1`,
        [row.id, acceptedAt],
      );
      await client.query(
        `UPDATE booking_offers
            SET customer_status = 'superseded', token_revoked_at = COALESCE(token_revoked_at, NOW())
          WHERE provisional_booking_id = $1 AND id <> $2 AND customer_status = 'active'`,
        [row.provisional_booking_id, row.id],
      );
      await client.query(
        `UPDATE provisional_bookings
            SET status = 'payment_pending',
                deposit_pence = $2,
                balance_due_pence = $3,
                deposit_due_at = $4,
                balance_due_on = $5,
                payment_terms_snapshot = $6::jsonb
          WHERE id = $1`,
        [
          row.provisional_booking_id,
          paymentTerms.initialPaymentPence,
          paymentTerms.balanceDuePence,
          paymentTerms.initialPaymentDueAt,
          paymentTerms.balanceDueOn,
          JSON.stringify(paymentTerms),
        ],
      );
      await client.query(
        `INSERT INTO booking_activity
           (provisional_booking_id, booking_offer_id, actor, event_type)
         VALUES ($1, $2, 'customer', 'offer_accepted_payment_required')`,
        [row.provisional_booking_id, row.id],
      );
      await insertBotBookingMessage(client, {
        bookingId: row.provisional_booking_id,
        offerId: row.id,
        body: paymentTerms.fullPaymentRequired
          ? 'The Booker accepted the offer. Full payment is required before the booking is confirmed.'
          : 'The Booker accepted the offer. The initial deposit is required before the booking is confirmed.',
        audience: 'administrator',
        sourceKey: `offer-accepted-payment-required:${row.id}`,
      });
      await client.query('COMMIT');
      return 'accepted';
    }

    await client.query(
      `UPDATE booking_offers SET customer_status = 'declined', declined_at = NOW() WHERE id = $1`,
      [row.id],
    );
    await client.query(
      `UPDATE provisional_bookings SET status = 'declined' WHERE id = $1`,
      [row.provisional_booking_id],
    );
    await client.query(
      `INSERT INTO booking_activity
         (provisional_booking_id, booking_offer_id, actor, event_type)
       VALUES ($1, $2, 'customer', 'offer_declined')`,
      [row.provisional_booking_id, row.id],
    );
    await insertBotBookingMessage(client, {
      bookingId: row.provisional_booking_id,
      offerId: row.id,
      body: 'The Booker declined the booking offer.',
      audience: 'administrator',
      sourceKey: `offer-declined:${row.id}`,
    });
    await client.query('COMMIT');
    return 'declined';
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}


export async function recordBookingActivity(input: {
  bookingReference: string;
  offerId?: string | null;
  actor: 'administrator' | 'customer' | 'system';
  eventType: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO booking_activity
         (provisional_booking_id, booking_offer_id, actor, event_type, details)
       SELECT pb.id, $2, $3, $4, $5::jsonb
         FROM provisional_bookings pb
        WHERE pb.public_id = $1::uuid
       RETURNING id, provisional_booking_id, booking_offer_id`,
      [
        input.bookingReference,
        input.offerId || null,
        input.actor,
        input.eventType,
        JSON.stringify(input.details || {}),
      ],
    );
    const botMessage = botMessageForActivity(input.eventType);
    if (result.rowCount && botMessage) {
      const row = result.rows[0];
      await insertBotBookingMessage(client, {
        bookingId: row.provisional_booking_id,
        offerId: row.booking_offer_id,
        body: botMessage.body,
        audience: botMessage.audience,
        sourceKey: `activity:${row.id}`,
      });
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export type BookingActivity = {
  id: string;
  actor: 'administrator' | 'customer' | 'system';
  eventType: string;
  details: Record<string, unknown>;
  createdAt: string;
  offerReference: string | null;
};

export async function getBookingActivity(reference: string): Promise<BookingActivity[]> {
  const result = await getPool().query(
    `SELECT ba.id::text, ba.actor, ba.event_type AS "eventType", ba.details,
            ba.created_at AS "createdAt", bo.public_id::text AS "offerReference"
       FROM booking_activity ba
       JOIN provisional_bookings pb ON pb.id = ba.provisional_booking_id
       LEFT JOIN booking_offers bo ON bo.id = ba.booking_offer_id
      WHERE pb.public_id = $1::uuid
      ORDER BY ba.created_at DESC, ba.id DESC`,
    [reference],
  );
  return result.rows.map((row) => ({
    ...row,
    createdAt: new Date(row.createdAt).toISOString(),
  }));
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
