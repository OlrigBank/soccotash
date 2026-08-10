import { BOOKING_STATUSES, type BookingStatus } from './lifecycle.ts';

type QueryExecutor = {
  query: (text: string, values?: any[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
};

export const BLOCKING_BOOKING_STATUSES = Object.freeze(
  (Object.entries(BOOKING_STATUSES) as [BookingStatus, (typeof BOOKING_STATUSES)[BookingStatus]][])
    .filter(([, definition]) => definition.blocksDates)
    .map(([status]) => status),
);

export const DIRECT_BOOKING_STATUSES = Object.freeze(
  ['confirmed', 'approved'] satisfies BookingStatus[],
);

export const INACTIVE_BOOKING_STATUSES = Object.freeze(
  ['declined', 'expired'] satisfies BookingStatus[],
);

export type BookingBlock = {
  startsOn: string;
  endsOn: string;
  source: string;
};

export type AdminCalendarEntry = {
  id: string;
  propertyId: string;
  startsOn: string;
  endsOn: string;
  source: 'airbnb' | 'external' | 'provisional' | 'direct' | 'override';
  guestName: string | null;
  bookingReference: string | null;
  bookingStatus: string | null;
  reason: string | null;
};

export async function hasBookingDateConflict(
  database: QueryExecutor,
  input: {
    availabilityPropertyId: string;
    propertyIds: string[];
    arrival: string;
    departure: string;
    excludeBookingId?: string | null;
    applyAvailabilityOverrides?: boolean;
  },
): Promise<boolean> {
  const result = await database.query(
    `SELECT 1 FROM booking_blocks block
      WHERE property_id = $1 AND starts_on < $3::date AND ends_on > $2::date
        AND EXISTS (
          SELECT 1
            FROM generate_series(
              GREATEST(block.starts_on, $2::date),
              LEAST(block.ends_on, $3::date) - 1,
              INTERVAL '1 day'
            ) AS blocked_night(value)
           WHERE (NOT $7::boolean OR NOT EXISTS (
             SELECT 1 FROM calendar_availability_overrides override
              WHERE override.property_id = $1
                AND override.available_on = blocked_night.value::date
           ))
        )
     UNION ALL
     SELECT 1 FROM provisional_bookings booking
      WHERE property_id = ANY($4::text[])
        AND status = ANY($5::text[])
        AND NOT (booking.property_id = 'bespoke-arrangement' AND booking.status = 'pending')
        AND ($6::bigint IS NULL OR id <> $6::bigint)
        AND arrival < $3::date AND departure > $2::date
        AND EXISTS (
          SELECT 1
            FROM generate_series(
              GREATEST(booking.arrival, $2::date),
              LEAST(booking.departure, $3::date) - 1,
              INTERVAL '1 day'
            ) AS blocked_night(value)
           WHERE (NOT $7::boolean OR NOT EXISTS (
             SELECT 1 FROM calendar_availability_overrides override
              WHERE override.property_id = $1
                AND override.available_on = blocked_night.value::date
           ))
        )
     LIMIT 1`,
    [
      input.availabilityPropertyId,
      input.arrival,
      input.departure,
      input.propertyIds,
      [...BLOCKING_BOOKING_STATUSES],
      input.excludeBookingId ?? null,
      input.applyAvailabilityOverrides ?? false,
    ],
  );
  return result.rows.length > 0;
}

export async function queryBookingBlocks(
  database: QueryExecutor,
  input: {
    availabilityPropertyId: string;
    propertyIds: string[];
    from: string;
    to: string;
    applyAvailabilityOverrides?: boolean;
  },
): Promise<BookingBlock[]> {
  const result = await database.query(
    `WITH raw_blocks AS (
       SELECT 'block-' || block.id::text AS block_key,
              block.starts_on, block.ends_on, block.source
         FROM booking_blocks block
        WHERE block.property_id = $1
          AND block.starts_on < $3::date AND block.ends_on > $2::date
       UNION ALL
       SELECT 'booking-' || booking.id::text AS block_key,
              booking.arrival AS starts_on,
              booking.departure AS ends_on,
              CASE WHEN booking.status = ANY($5::text[]) THEN 'direct' ELSE 'provisional' END AS source
         FROM provisional_bookings booking
        WHERE booking.property_id = ANY($4::text[])
          AND booking.status = ANY($6::text[])
          AND NOT (booking.property_id = 'bespoke-arrangement' AND booking.status = 'pending')
          AND booking.arrival < $3::date AND booking.departure > $2::date
     ), unblocked_nights_removed AS (
       SELECT raw.block_key, raw.source, blocked_night.value::date AS blocked_on
         FROM raw_blocks raw
         CROSS JOIN LATERAL generate_series(
           GREATEST(raw.starts_on, $2::date),
           LEAST(raw.ends_on, $3::date) - 1,
           INTERVAL '1 day'
         ) AS blocked_night(value)
        WHERE (NOT $7::boolean OR NOT EXISTS (
          SELECT 1 FROM calendar_availability_overrides override
           WHERE override.property_id = $1
             AND override.available_on = blocked_night.value::date
        ))
     ), contiguous_nights AS (
       SELECT block_key, source, blocked_on,
              blocked_on - ROW_NUMBER() OVER (PARTITION BY block_key ORDER BY blocked_on)::int AS island
         FROM unblocked_nights_removed
     )
     SELECT MIN(blocked_on)::text AS "startsOn",
            (MAX(blocked_on) + 1)::text AS "endsOn",
            source
       FROM contiguous_nights
      GROUP BY block_key, source, island
      ORDER BY "startsOn"`,
    [
      input.availabilityPropertyId,
      input.from,
      input.to,
      input.propertyIds,
      [...DIRECT_BOOKING_STATUSES],
      [...BLOCKING_BOOKING_STATUSES],
      input.applyAvailabilityOverrides ?? false,
    ],
  );
  return result.rows;
}

export async function queryAdminCalendarEntries(
  database: QueryExecutor,
  from: string,
  to: string,
): Promise<AdminCalendarEntry[]> {
  const result = await database.query(
    `SELECT 'block-' || bb.id::text AS id,
            bb.property_id AS "propertyId",
            bb.starts_on::text AS "startsOn",
            bb.ends_on::text AS "endsOn",
            CASE WHEN bb.source = 'airbnb' THEN 'airbnb' ELSE 'external' END AS source,
            NULL::text AS "guestName",
            NULL::text AS "bookingReference",
            NULL::text AS "bookingStatus",
            NULL::text AS reason
       FROM booking_blocks bb
      WHERE bb.starts_on < $2::date AND bb.ends_on > $1::date
      UNION ALL
     SELECT 'booking-' || pb.id::text AS id,
            pb.property_id AS "propertyId",
            pb.arrival::text AS "startsOn",
            pb.departure::text AS "endsOn",
            CASE WHEN pb.status = ANY($3::text[]) THEN 'direct' ELSE 'provisional' END AS source,
            pb.guest_name AS "guestName",
            pb.public_id::text AS "bookingReference",
            pb.status AS "bookingStatus",
            NULL::text AS reason
       FROM provisional_bookings pb
      WHERE (pb.status = ANY($4::text[]) OR (pb.property_id = 'bespoke-arrangement' AND pb.status = 'pending'))
        AND pb.arrival < $2::date AND pb.departure > $1::date
      UNION ALL
     SELECT 'override-' || override.id::text AS id,
            override.property_id AS "propertyId",
            override.available_on::text AS "startsOn",
            (override.available_on + 1)::text AS "endsOn",
            'override'::text AS source,
            NULL::text AS "guestName",
            NULL::text AS "bookingReference",
            NULL::text AS "bookingStatus",
            override.reason
       FROM calendar_availability_overrides override
      WHERE override.available_on >= $1::date AND override.available_on < $2::date
      ORDER BY "startsOn", "propertyId", source`,
    [from, to, [...DIRECT_BOOKING_STATUSES], [...BLOCKING_BOOKING_STATUSES]],
  );
  return result.rows.map((row) => ({
    id: String(row.id),
    propertyId: row.propertyId,
    startsOn: row.startsOn,
    endsOn: row.endsOn,
    source: row.source,
    guestName: row.guestName,
    bookingReference: row.bookingReference,
    bookingStatus: row.bookingStatus,
    reason: row.reason,
  }));
}

export async function queryProvisionalBookingRequestRows(
  database: QueryExecutor,
  limit: number,
  includeInactive: boolean,
  deletionScope: 'active' | 'marked' | 'all' = 'active',
): Promise<Record<string, any>[]> {
  const result = await database.query(
    `SELECT pb.public_id::text AS reference, pb.property_id AS "propertyId", pb.arrival::text, pb.departure::text,
            pb.guests, pb.pets, pb.guest_name AS name, pb.guest_email AS email, pb.guest_telephone AS telephone,
            pb.guest_message AS message, pb.status, pb.pricing_currency AS "pricingCurrency",
            pb.guest_total_pence AS "guestTotalPence", pb.pricing_plan_version AS "pricingPlanVersion",
            pb.quoted_at AS "quotedAt", pb.created_at AS "createdAt",
            pb.deletion_requested_at AS "deletionRequestedAt", pb.deletion_reason AS "deletionReason",
            latest_offer.total_pence AS "latestOfferTotalPence",
            latest_offer.currency AS "latestOfferCurrency",
            latest_offer.sent_at AS "latestOfferSentAt",
            payment_summary."currentPaymentPublicId", payment_summary."currentPaymentStage",
            payment_summary."currentPaymentStatus", payment_summary."depositVerified",
            payment_summary."balanceVerified", payment_summary."fullPaymentVerified",
            (SELECT COUNT(*)::int FROM booking_messages bm
              WHERE bm.provisional_booking_id = pb.id AND bm.admin_read_at IS NULL) AS "unreadMessageCount"
       FROM provisional_bookings pb
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
      WHERE ($2::boolean OR NOT (pb.status = ANY($3::text[])))
        AND ($4::text='all' OR ($4::text='active' AND pb.deletion_requested_at IS NULL)
          OR ($4::text='marked' AND pb.deletion_requested_at IS NOT NULL))
      ORDER BY pb.created_at DESC
      LIMIT $1`,
    [
      Math.max(1, Math.min(500, Math.round(limit))),
      includeInactive,
      [...INACTIVE_BOOKING_STATUSES],
      deletionScope,
    ],
  );
  return result.rows;
}
