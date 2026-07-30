import crypto from 'node:crypto';
import { getPool } from './db.ts';
import {
  bookingAccessExpiresOn,
  bookingAccessState,
  getBookingAccessExpiryDays,
  type BookingAccessState,
} from './booking-access-policy.ts';

const tokenPattern = /^[A-Za-z0-9_-]{43,128}$/;

function tokenHash(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function validBookingAccessCredential(token: string): boolean {
  return tokenPattern.test(token);
}

export type BookingAccessResolution =
  | {
      allowed: true;
      bookingId: string;
      reference: string;
      source: 'booking' | 'offer';
      offerId: string | null;
      expiresOn: string;
    }
  | {
      allowed: false;
      reason: 'invalid' | 'not_found' | 'revoked' | 'expired';
      reference?: string;
    };

export async function resolveBookingAccessCredential(
  token: string,
  options: { recordUse?: boolean; recordDenied?: boolean } = {},
): Promise<BookingAccessResolution> {
  if (!validBookingAccessCredential(token)) return { allowed: false, reason: 'invalid' };

  const hash = tokenHash(token);
  const result = await getPool().query(
    `WITH candidate AS (
       SELECT pb.id::text AS booking_id, pb.public_id::text AS reference,
              pb.departure::text, pb.customer_access_token_revoked_at AS revoked_at,
              'booking'::text AS source, NULL::text AS offer_id, 1 AS priority
         FROM provisional_bookings pb
        WHERE pb.customer_access_token = $1
       UNION ALL
       SELECT pb.id::text AS booking_id, pb.public_id::text AS reference,
              pb.departure::text, COALESCE(pb.customer_access_token_revoked_at, NOW()) AS revoked_at,
              'previous_booking'::text AS source, NULL::text AS offer_id, 2 AS priority
         FROM provisional_bookings pb
        WHERE pb.customer_access_revoked_token_hash = $2
       UNION ALL
       SELECT pb.id::text AS booking_id, pb.public_id::text AS reference,
              pb.departure::text, bo.token_revoked_at AS revoked_at,
              'offer'::text AS source, bo.id::text AS offer_id, 3 AS priority
         FROM booking_offers bo
         JOIN provisional_bookings pb ON pb.id = bo.provisional_booking_id
        WHERE bo.access_token_hash = $2
     )
     SELECT * FROM candidate ORDER BY priority LIMIT 1`,
    [token, hash],
  );

  if (!result.rowCount) return { allowed: false, reason: 'not_found' };

  const row = result.rows[0];
  const expiryDays = getBookingAccessExpiryDays();
  const state = row.source === 'previous_booking'
    ? 'revoked'
    : bookingAccessState({
        departure: row.departure,
        revokedAt: row.revoked_at,
        expiryDays,
      });

  if (state !== 'active') {
    if (options.recordDenied) {
      await getPool().query(
        `INSERT INTO booking_activity (provisional_booking_id, booking_offer_id, actor, event_type, details)
         VALUES ($1, $2, 'system', 'booking_access_denied', $3::jsonb)`,
        [
          row.booking_id,
          row.offer_id,
          JSON.stringify({ reason: state, source: row.source, expiryDays }),
        ],
      );
    }
    return { allowed: false, reason: state, reference: row.reference };
  }

  if (options.recordUse) {
    await getPool().query(
      `UPDATE provisional_bookings
          SET customer_access_last_used_at = NOW()
        WHERE id = $1`,
      [row.booking_id],
    );
  }

  return {
    allowed: true,
    bookingId: row.booking_id,
    reference: row.reference,
    source: row.source as 'booking' | 'offer',
    offerId: row.offer_id,
    expiresOn: bookingAccessExpiresOn(row.departure, expiryDays),
  };
}

export type BookingAccessAdminState = {
  state: BookingAccessState;
  issuedAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
  expiresOn: string;
  expiryDays: number;
  activeOfferCredentialCount: number;
};

export async function getBookingAccessAdminState(reference: string): Promise<BookingAccessAdminState | null> {
  const result = await getPool().query(
    `SELECT pb.departure::text, pb.customer_access_token_issued_at AS issued_at,
            pb.customer_access_token_revoked_at AS revoked_at,
            pb.customer_access_last_used_at AS last_used_at,
            (SELECT COUNT(*)::int
               FROM booking_offers bo
              WHERE bo.provisional_booking_id = pb.id
                AND bo.access_token_hash IS NOT NULL
                AND bo.token_revoked_at IS NULL) AS active_offer_credential_count
       FROM provisional_bookings pb
      WHERE pb.public_id = $1::uuid`,
    [reference],
  );
  if (!result.rowCount) return null;

  const row = result.rows[0];
  const expiryDays = getBookingAccessExpiryDays();
  return {
    state: bookingAccessState({ departure: row.departure, revokedAt: row.revoked_at, expiryDays }),
    issuedAt: new Date(row.issued_at).toISOString(),
    revokedAt: row.revoked_at ? new Date(row.revoked_at).toISOString() : null,
    lastUsedAt: row.last_used_at ? new Date(row.last_used_at).toISOString() : null,
    expiresOn: bookingAccessExpiresOn(row.departure, expiryDays),
    expiryDays,
    activeOfferCredentialCount: Number(row.active_offer_credential_count || 0),
  };
}

export async function rotateBookingAccessCredential(input: {
  reference: string;
  adminUserId: string;
  reason?: string;
}): Promise<{ token: string; expiresOn: string } | null> {
  const token = crypto.randomBytes(32).toString('base64url');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const selected = await client.query(
      `SELECT id, departure::text, customer_access_token
         FROM provisional_bookings
        WHERE public_id = $1::uuid
        FOR UPDATE`,
      [input.reference],
    );
    if (!selected.rowCount) {
      await client.query('ROLLBACK');
      return null;
    }

    const row = selected.rows[0];
    const previousTokenHash = row.customer_access_token
      ? tokenHash(String(row.customer_access_token))
      : null;
    await client.query(
      `UPDATE provisional_bookings
          SET customer_access_revoked_token_hash = COALESCE($3, customer_access_revoked_token_hash),
              customer_access_token = $2,
              customer_access_token_issued_at = NOW(),
              customer_access_token_revoked_at = NULL,
              customer_access_last_used_at = NULL
        WHERE id = $1`,
      [row.id, token, previousTokenHash],
    );
    const revokedOffers = await client.query(
      `UPDATE booking_offers
          SET token_revoked_at = COALESCE(token_revoked_at, NOW()),
              access_token_hash = NULL
        WHERE provisional_booking_id = $1
          AND access_token_hash IS NOT NULL`,
      [row.id],
    );

    const expiryDays = getBookingAccessExpiryDays();
    const expiresOn = bookingAccessExpiresOn(row.departure, expiryDays);
    await client.query(
      `INSERT INTO booking_activity (provisional_booking_id, actor, event_type, details)
       VALUES ($1, 'administrator', 'booking_access_rotated', $2::jsonb)`,
      [
        row.id,
        JSON.stringify({
          adminUserId: input.adminUserId,
          reason: input.reason?.trim() || null,
          revokedOfferCredentials: revokedOffers.rowCount,
          expiryDays,
          expiresOn,
        }),
      ],
    );
    await client.query('COMMIT');
    return { token, expiresOn };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function revokeBookingAccessCredential(input: {
  reference: string;
  adminUserId: string;
  reason: string;
}): Promise<boolean> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const selected = await client.query(
      `SELECT id, customer_access_token, customer_access_token_revoked_at
         FROM provisional_bookings
        WHERE public_id = $1::uuid
        FOR UPDATE`,
      [input.reference],
    );
    if (!selected.rowCount) {
      await client.query('ROLLBACK');
      return false;
    }

    const row = selected.rows[0];
    if (row.customer_access_token_revoked_at) {
      await client.query('ROLLBACK');
      return true;
    }

    const revokedTokenHash = row.customer_access_token
      ? tokenHash(String(row.customer_access_token))
      : null;
    await client.query(
      `UPDATE provisional_bookings
          SET customer_access_revoked_token_hash = $2,
              customer_access_token = NULL,
              customer_access_token_revoked_at = NOW()
        WHERE id = $1`,
      [row.id, revokedTokenHash],
    );
    const revokedOffers = await client.query(
      `UPDATE booking_offers
          SET token_revoked_at = COALESCE(token_revoked_at, NOW()),
              access_token_hash = NULL
        WHERE provisional_booking_id = $1
          AND access_token_hash IS NOT NULL`,
      [row.id],
    );
    await client.query(
      `INSERT INTO booking_activity (provisional_booking_id, actor, event_type, details)
       VALUES ($1, 'administrator', 'booking_access_revoked', $2::jsonb)`,
      [
        row.id,
        JSON.stringify({
          adminUserId: input.adminUserId,
          reason: input.reason.trim(),
          revokedOfferCredentials: revokedOffers.rowCount,
        }),
      ],
    );
    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
