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
  bookingDate: string | null;
  cancellationPolicy: string;
  hostNotes: string | null;
  guestProfileText: string | null;
  accessCodeRetained: boolean;
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
