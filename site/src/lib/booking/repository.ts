import { getAvailabilityProperty, getPropertiesSharingAvailability, getProperty } from './config';
import { getPool } from './db';
import type { ImportedBlock } from './ical';

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
     WHERE property_id = ANY($4::text[]) AND status IN ('pending', 'approved')
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
  name: string;
  email: string;
  telephone?: string;
  message?: string;
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
       WHERE property_id = ANY($4::text[]) AND status IN ('pending','approved')
         AND arrival < $3::date AND departure > $2::date LIMIT 1`,
      [availabilityProperty.id, input.arrival, input.departure, linkedPropertyIds],
    );
    if (conflict.rowCount) throw new Error('DATES_UNAVAILABLE');
    const result = await client.query(
      `INSERT INTO provisional_bookings
       (property_id, arrival, departure, guests, guest_name, guest_email, guest_telephone, guest_message)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING public_id`,
      [input.propertyId, input.arrival, input.departure, input.guests, input.name, input.email, input.telephone || null, input.message || null],
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
       guest_name AS name,
       guest_email AS email,
       guest_telephone AS telephone,
       guest_message AS message,
       status,
       created_at AS "createdAt"
     FROM provisional_bookings
     ORDER BY created_at DESC
     LIMIT 100`,
  );
  return { calendars: calendars.rows, provisionalRequests: provisionalRequests.rows };
}
