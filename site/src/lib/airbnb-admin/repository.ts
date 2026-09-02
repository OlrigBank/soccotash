import type pg from 'pg';
import { getPool } from '../booking/db.ts';

type QueryDatabase = Pick<pg.Pool, 'query'> | Pick<pg.PoolClient, 'query'>;

export const AIRBNB_ADMIN_MAX_PAGE_SIZE = 100;

export type AirbnbReservationStatusFilter = 'confirmed' | 'cancelled' | 'unset';
export type AirbnbLinkFilter = 'confirmed' | 'proposed' | 'unlinked';
export type AirbnbReservationSort = 'arrival-desc' | 'arrival-asc' | 'captured-desc';
export type AirbnbReviewSort = 'published-desc' | 'published-asc' | 'arrival-desc';

export interface AirbnbListPage<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface AirbnbReservationListQuery {
  page: number;
  pageSize: number;
  sort: AirbnbReservationSort;
  propertyId: string | null;
  arrivalFrom: string | null;
  arrivalTo: string | null;
  status: AirbnbReservationStatusFilter | null;
  link: AirbnbLinkFilter | null;
  search: string | null;
}

export interface AirbnbReviewListQuery {
  page: number;
  pageSize: number;
  sort: AirbnbReviewSort;
  propertyId: string | null;
  publishedFrom: string | null;
  publishedTo: string | null;
  rating: number | null;
  link: AirbnbLinkFilter | null;
  hasPrivateFeedback: boolean | null;
  search: string | null;
}

export interface AirbnbReservationSummary {
  id: string;
  propertyId: string | null;
  sourceListingName: string;
  bookerDisplayName: string;
  partyDisplayName: string | null;
  arrival: string;
  departure: string;
  nights: number;
  partySize: number | null;
  sourceStatus: string | null;
  confirmationCodePresent: boolean;
  reviewLinkStatus: 'confirmed' | 'proposed' | null;
}

export interface AirbnbReviewSummary {
  id: string;
  reviewerDisplayName: string;
  propertyId: string | null;
  sourceListingName: string;
  arrival: string;
  departure: string;
  publishedOn: string;
  overallRating: number;
  hasPrivateFeedback: boolean;
  reservationLinkStatus: 'confirmed' | 'proposed' | null;
}

export interface AirbnbReservationDetail extends AirbnbReservationSummary {
  confirmationCode: string | null;
  bookingDate: string | null;
  checkInTime: string | null;
  checkOutTime: string | null;
  adults: number | null;
  children: number | null;
  infants: number | null;
  pets: number | null;
  cancellationPolicy: string;
  hostNotes: string | null;
  guestProfileText: string | null;
  accessCodeRetained: boolean;
  conversation: AirbnbConversationEntry[];
  financialSummaries: AirbnbFinancialSummary[];
  provenance: AirbnbReservationProvenance[];
  reviewLinks: AirbnbReservationReviewLink[];
}

export interface AirbnbConversationEntry {
  position: number;
  entryType: 'message' | 'service_event';
  senderType: 'guest' | 'host' | 'airbnb' | 'unknown';
  senderDisplayName: string;
  body: string;
  displayedDate: string;
  displayedTime: string;
  sentAt: string | null;
  timestampPrecision: 'exact' | 'date_inferred' | 'year_unknown' | 'unresolved';
  reactions: Array<{ reaction: string; reactorDisplayName: string | null }>;
}

export interface AirbnbFinancialLineItem {
  position: number;
  parentPosition: number | null;
  itemType: string;
  description: string;
  serviceDate: string | null;
  quantity: number | null;
  unitAmountMinor: number | null;
  amountMinor: number;
}

export interface AirbnbFinancialSummary {
  perspective: 'host_earnings' | 'guest_paid';
  currency: string;
  totalMinor: number;
  arithmeticStatus: string;
  arithmeticDifferenceMinor: number | null;
  lineItems: AirbnbFinancialLineItem[];
}

export interface AirbnbReservationProvenance {
  documentType: 'booking';
  relativePath: string;
  abbreviatedHash: string;
  capturedAt: string;
  isPreferred: boolean;
}

export interface AirbnbReservationReviewLink {
  reviewId: string;
  status: 'proposed' | 'confirmed' | 'rejected';
  reviewerDisplayName: string;
  overallRating: number;
}

export interface AirbnbReviewDetail extends AirbnbReviewSummary {
  publicText: string;
  privateFeedback: string | null;
}

function integer(value: string | null, fallback: number, minimum: number, maximum: number): number {
  if (!value || !/^\d+$/u.test(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Number(value)));
}

function date(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value ? null : value;
}

function text(value: string | null, maximum: number): string | null {
  const cleaned = value?.normalize('NFKC').replace(/\s+/gu, ' ').trim().slice(0, maximum);
  return cleaned || null;
}

function choice<T extends string>(value: string | null, values: readonly T[], fallback: T | null): T | null {
  return value && (values as readonly string[]).includes(value) ? value as T : fallback;
}

export function parseAirbnbReservationListQuery(params: URLSearchParams): AirbnbReservationListQuery {
  return {
    page: integer(params.get('page'), 1, 1, 100_000),
    pageSize: integer(params.get('pageSize'), 25, 1, AIRBNB_ADMIN_MAX_PAGE_SIZE),
    sort: choice(params.get('sort'), ['arrival-desc', 'arrival-asc', 'captured-desc'] as const, 'arrival-desc')!,
    propertyId: text(params.get('property'), 100),
    arrivalFrom: date(params.get('from')),
    arrivalTo: date(params.get('to')),
    status: choice(params.get('status'), ['confirmed', 'cancelled', 'unset'] as const, null),
    link: choice(params.get('link'), ['confirmed', 'proposed', 'unlinked'] as const, null),
    search: text(params.get('search'), 200),
  };
}

export function parseAirbnbReviewListQuery(params: URLSearchParams): AirbnbReviewListQuery {
  const ratingValue = params.get('rating');
  const rating = ratingValue && /^[1-5]$/u.test(ratingValue) ? Number(ratingValue) : null;
  return {
    page: integer(params.get('page'), 1, 1, 100_000),
    pageSize: integer(params.get('pageSize'), 25, 1, AIRBNB_ADMIN_MAX_PAGE_SIZE),
    sort: choice(params.get('sort'), ['published-desc', 'published-asc', 'arrival-desc'] as const, 'published-desc')!,
    propertyId: text(params.get('property'), 100),
    publishedFrom: date(params.get('from')),
    publishedTo: date(params.get('to')),
    rating,
    link: choice(params.get('link'), ['confirmed', 'proposed', 'unlinked'] as const, null),
    hasPrivateFeedback: choice(params.get('private'), ['yes', 'no'] as const, null) === 'yes' ? true
      : choice(params.get('private'), ['yes', 'no'] as const, null) === 'no' ? false : null,
    search: text(params.get('search'), 200),
  };
}

function likePattern(value: string): string {
  return `%${value.replace(/[\\%_]/gu, '\\$&')}%`;
}

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

export async function getAirbnbDashboardSummary(database: QueryDatabase = getPool()): Promise<{
  reservations: number; reviews: number; proposedLinks: number;
}> {
  const result = await database.query(`SELECT
    (SELECT count(*)::int FROM airbnb_reservations) AS reservations,
    (SELECT count(*)::int FROM airbnb_reviews) AS reviews,
    (SELECT count(*)::int FROM airbnb_review_reservation_links WHERE link_status='proposed') AS proposed_links`);
  return {
    reservations: Number(result.rows[0].reservations),
    reviews: Number(result.rows[0].reviews),
    proposedLinks: Number(result.rows[0].proposed_links),
  };
}

export async function listAirbnbReservations(
  query: AirbnbReservationListQuery,
  database: QueryDatabase = getPool(),
): Promise<AirbnbListPage<AirbnbReservationSummary>> {
  const page = Math.max(1, Math.trunc(query.page) || 1);
  const pageSize = Math.min(AIRBNB_ADMIN_MAX_PAGE_SIZE, Math.max(1, Math.trunc(query.pageSize) || 25));
  const conditions: string[] = [];
  const values: unknown[] = [];
  const add = (sql: string, value: unknown): void => { values.push(value); conditions.push(sql.replace('?', `$${values.length}`)); };
  if (query.propertyId) add('reservation.property_id=?', query.propertyId);
  if (query.arrivalFrom) add('reservation.arrival>=?::date', query.arrivalFrom);
  if (query.arrivalTo) add('reservation.arrival<=?::date', query.arrivalTo);
  if (query.status === 'unset') conditions.push('reservation.source_status_text IS NULL');
  else if (query.status) add('lower(reservation.source_status_text)=?', query.status);
  if (query.search) add(`(reservation.booker_display_name ILIKE ? ESCAPE '\\' OR reservation.party_display_name ILIKE $${values.length + 1} ESCAPE '\\')`, likePattern(query.search));
  if (query.link === 'unlinked') conditions.push('NOT EXISTS (SELECT 1 FROM airbnb_review_reservation_links link WHERE link.reservation_id=reservation.id)');
  else if (query.link) add('EXISTS (SELECT 1 FROM airbnb_review_reservation_links link WHERE link.reservation_id=reservation.id AND link.link_status=?)', query.link);
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const total = Number((await database.query(`SELECT count(*)::int AS count FROM airbnb_reservations reservation ${where}`, values)).rows[0].count);
  const order = query.sort === 'arrival-asc' ? 'reservation.arrival ASC, reservation.id ASC'
    : query.sort === 'captured-desc' ? 'reservation.source_captured_at DESC, reservation.id DESC'
      : 'reservation.arrival DESC, reservation.id DESC';
  const pageValues = [...values, pageSize, (page - 1) * pageSize];
  const rows = (await database.query(`SELECT reservation.public_id::text AS id,
      reservation.property_id, reservation.source_listing_name, reservation.booker_display_name,
      reservation.party_display_name, reservation.arrival, reservation.departure,
      reservation.nights, reservation.party_size, reservation.source_status_text,
      reservation.confirmation_code IS NOT NULL AS confirmation_code_present,
      (SELECT CASE WHEN bool_or(link.link_status='confirmed') THEN 'confirmed'
                   WHEN bool_or(link.link_status='proposed') THEN 'proposed' END
         FROM airbnb_review_reservation_links link WHERE link.reservation_id=reservation.id) AS review_link_status
    FROM airbnb_reservations reservation ${where} ORDER BY ${order}
    LIMIT $${values.length + 1} OFFSET $${values.length + 2}`, pageValues)).rows;
  return { items: rows.map((row) => ({
    id: row.id, propertyId: row.property_id, sourceListingName: row.source_listing_name,
    bookerDisplayName: row.booker_display_name, partyDisplayName: row.party_display_name,
    arrival: iso(row.arrival), departure: iso(row.departure), nights: Number(row.nights),
    partySize: row.party_size === null ? null : Number(row.party_size), sourceStatus: row.source_status_text,
    confirmationCodePresent: row.confirmation_code_present, reviewLinkStatus: row.review_link_status,
  })), page, pageSize, total };
}

export async function listAirbnbReviews(
  query: AirbnbReviewListQuery,
  database: QueryDatabase = getPool(),
): Promise<AirbnbListPage<AirbnbReviewSummary>> {
  const page = Math.max(1, Math.trunc(query.page) || 1);
  const pageSize = Math.min(AIRBNB_ADMIN_MAX_PAGE_SIZE, Math.max(1, Math.trunc(query.pageSize) || 25));
  const conditions: string[] = [];
  const values: unknown[] = [];
  const add = (sql: string, value: unknown): void => { values.push(value); conditions.push(sql.replace('?', `$${values.length}`)); };
  if (query.propertyId) add('review.property_id=?', query.propertyId);
  if (query.publishedFrom) add('review.published_on>=?::date', query.publishedFrom);
  if (query.publishedTo) add('review.published_on<=?::date', query.publishedTo);
  if (query.rating) add('review.overall_rating=?', query.rating);
  if (query.hasPrivateFeedback !== null) conditions.push(query.hasPrivateFeedback ? 'review.private_feedback IS NOT NULL' : 'review.private_feedback IS NULL');
  if (query.search) add(`review.reviewer_display_name ILIKE ? ESCAPE '\\'`, likePattern(query.search));
  if (query.link === 'unlinked') conditions.push('NOT EXISTS (SELECT 1 FROM airbnb_review_reservation_links link WHERE link.review_id=review.id)');
  else if (query.link) add('EXISTS (SELECT 1 FROM airbnb_review_reservation_links link WHERE link.review_id=review.id AND link.link_status=?)', query.link);
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const total = Number((await database.query(`SELECT count(*)::int AS count FROM airbnb_reviews review ${where}`, values)).rows[0].count);
  const order = query.sort === 'published-asc' ? 'review.published_on ASC, review.id ASC'
    : query.sort === 'arrival-desc' ? 'review.arrival DESC, review.id DESC'
      : 'review.published_on DESC, review.id DESC';
  const rows = (await database.query(`SELECT review.public_id::text AS id,
      review.reviewer_display_name, review.property_id, review.source_listing_name,
      review.arrival, review.departure, review.published_on, review.overall_rating,
      review.private_feedback IS NOT NULL AS has_private_feedback,
      (SELECT CASE WHEN bool_or(link.link_status='confirmed') THEN 'confirmed'
                   WHEN bool_or(link.link_status='proposed') THEN 'proposed' END
         FROM airbnb_review_reservation_links link WHERE link.review_id=review.id) AS reservation_link_status
    FROM airbnb_reviews review ${where} ORDER BY ${order}
    LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
  [...values, pageSize, (page - 1) * pageSize])).rows;
  return { items: rows.map((row) => ({
    id: row.id, reviewerDisplayName: row.reviewer_display_name, propertyId: row.property_id,
    sourceListingName: row.source_listing_name, arrival: iso(row.arrival), departure: iso(row.departure),
    publishedOn: iso(row.published_on), overallRating: Number(row.overall_rating),
    hasPrivateFeedback: row.has_private_feedback, reservationLinkStatus: row.reservation_link_status,
  })), page, pageSize, total };
}

export async function getAirbnbReservationDetail(
  id: string,
  database: QueryDatabase = getPool(),
): Promise<AirbnbReservationDetail | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(id)) return null;
  const reservationResult = await database.query(
    `SELECT reservation.id::text AS internal_id, reservation.public_id::text AS id,
            reservation.confirmation_code, reservation.property_id, reservation.source_listing_name,
            reservation.booker_display_name, reservation.party_display_name,
            reservation.arrival, reservation.departure, reservation.nights,
            reservation.check_in_time::text, reservation.check_out_time::text,
            reservation.party_size, reservation.adults, reservation.children,
            reservation.infants, reservation.pets, reservation.booking_date,
            reservation.source_status_text, reservation.cancellation_policy,
            private.host_notes, private.guest_profile_text,
            private.access_code_ciphertext IS NOT NULL AS access_code_retained,
            (SELECT CASE WHEN bool_or(link.link_status='confirmed') THEN 'confirmed'
                         WHEN bool_or(link.link_status='proposed') THEN 'proposed' END
               FROM airbnb_review_reservation_links link WHERE link.reservation_id=reservation.id) AS review_link_status
       FROM airbnb_reservations reservation
       LEFT JOIN airbnb_reservation_private_details private ON private.reservation_id=reservation.id
      WHERE reservation.public_id=$1::uuid`,
    [id],
  );
  if (!reservationResult.rowCount) return null;
  const reservation = reservationResult.rows[0];
  const [conversationResult, financialResult, provenanceResult, reviewResult] = await Promise.all([
    database.query(
      `SELECT entry.id::text AS internal_id, entry.position, entry.entry_type,
              entry.sender_type, entry.sender_display_name, entry.body,
              entry.displayed_date, entry.displayed_time, entry.sent_at,
              entry.timestamp_precision,
              COALESCE(jsonb_agg(jsonb_build_object('reaction',reaction.reaction,
                       'reactorDisplayName',reaction.reactor_display_name)
                       ORDER BY reaction.position) FILTER (WHERE reaction.id IS NOT NULL),'[]') AS reactions
         FROM airbnb_conversation_entries entry
         LEFT JOIN airbnb_conversation_reactions reaction ON reaction.conversation_entry_id=entry.id
        WHERE entry.reservation_id=$1 GROUP BY entry.id ORDER BY entry.position`,
      [reservation.internal_id],
    ),
    database.query(
      `SELECT summary.id::text AS summary_internal_id, summary.perspective,
              summary.currency, summary.total_minor::text, summary.arithmetic_status,
              summary.arithmetic_difference_minor::text,
              item.position, parent.position AS parent_position, item.item_type,
              item.description, item.service_date, item.quantity::text,
              item.unit_amount_minor::text, item.amount_minor::text
         FROM airbnb_financial_summaries summary
         LEFT JOIN airbnb_financial_line_items item ON item.financial_summary_id=summary.id
         LEFT JOIN airbnb_financial_line_items parent ON parent.id=item.parent_line_item_id
        WHERE summary.reservation_id=$1
        ORDER BY CASE summary.perspective WHEN 'host_earnings' THEN 0 ELSE 1 END, item.position`,
      [reservation.internal_id],
    ),
    database.query(
      `SELECT source.document_type, source.relative_path, left(source.sha256,12) AS abbreviated_hash,
              source.captured_at, link.is_preferred
         FROM airbnb_reservation_documents link
         JOIN airbnb_source_documents source ON source.id=link.source_document_id
        WHERE link.reservation_id=$1 ORDER BY link.is_preferred DESC, source.captured_at DESC, source.id DESC`,
      [reservation.internal_id],
    ),
    database.query(
      `SELECT review.public_id::text AS review_id, link.link_status,
              review.reviewer_display_name, review.overall_rating
         FROM airbnb_review_reservation_links link
         JOIN airbnb_reviews review ON review.id=link.review_id
        WHERE link.reservation_id=$1
        ORDER BY CASE link.link_status WHEN 'confirmed' THEN 0 WHEN 'proposed' THEN 1 ELSE 2 END, review.id`,
      [reservation.internal_id],
    ),
  ]);
  const summaries = new Map<string, AirbnbFinancialSummary>();
  for (const row of financialResult.rows) {
    let summary = summaries.get(row.summary_internal_id);
    if (!summary) {
      summary = {
        perspective: row.perspective,
        currency: row.currency,
        totalMinor: Number(row.total_minor),
        arithmeticStatus: row.arithmetic_status,
        arithmeticDifferenceMinor: row.arithmetic_difference_minor === null ? null : Number(row.arithmetic_difference_minor),
        lineItems: [],
      };
      summaries.set(row.summary_internal_id, summary);
    }
    if (row.position !== null) summary.lineItems.push({
      position: Number(row.position), parentPosition: row.parent_position === null ? null : Number(row.parent_position),
      itemType: row.item_type, description: row.description,
      serviceDate: row.service_date === null ? null : iso(row.service_date),
      quantity: row.quantity === null ? null : Number(row.quantity),
      unitAmountMinor: row.unit_amount_minor === null ? null : Number(row.unit_amount_minor),
      amountMinor: Number(row.amount_minor),
    });
  }
  return {
    id: reservation.id,
    propertyId: reservation.property_id,
    sourceListingName: reservation.source_listing_name,
    bookerDisplayName: reservation.booker_display_name,
    partyDisplayName: reservation.party_display_name,
    arrival: iso(reservation.arrival), departure: iso(reservation.departure), nights: Number(reservation.nights),
    checkInTime: reservation.check_in_time, checkOutTime: reservation.check_out_time,
    partySize: reservation.party_size === null ? null : Number(reservation.party_size),
    adults: reservation.adults === null ? null : Number(reservation.adults),
    children: reservation.children === null ? null : Number(reservation.children),
    infants: reservation.infants === null ? null : Number(reservation.infants),
    pets: reservation.pets === null ? null : Number(reservation.pets),
    bookingDate: reservation.booking_date === null ? null : iso(reservation.booking_date),
    sourceStatus: reservation.source_status_text, cancellationPolicy: reservation.cancellation_policy,
    confirmationCode: reservation.confirmation_code,
    confirmationCodePresent: reservation.confirmation_code !== null,
    reviewLinkStatus: reservation.review_link_status,
    hostNotes: reservation.host_notes, guestProfileText: reservation.guest_profile_text,
    accessCodeRetained: reservation.access_code_retained,
    conversation: conversationResult.rows.map((row) => ({
      position: Number(row.position), entryType: row.entry_type, senderType: row.sender_type,
      senderDisplayName: row.sender_display_name, body: row.body,
      displayedDate: row.displayed_date, displayedTime: row.displayed_time,
      sentAt: row.sent_at instanceof Date ? row.sent_at.toISOString() : row.sent_at,
      timestampPrecision: row.timestamp_precision, reactions: row.reactions,
    })),
    financialSummaries: [...summaries.values()],
    provenance: provenanceResult.rows.map((row) => ({
      documentType: row.document_type, relativePath: row.relative_path,
      abbreviatedHash: row.abbreviated_hash,
      capturedAt: row.captured_at instanceof Date ? row.captured_at.toISOString() : String(row.captured_at),
      isPreferred: row.is_preferred,
    })),
    reviewLinks: reviewResult.rows.map((row) => ({
      reviewId: row.review_id, status: row.link_status,
      reviewerDisplayName: row.reviewer_display_name, overallRating: Number(row.overall_rating),
    })),
  };
}
