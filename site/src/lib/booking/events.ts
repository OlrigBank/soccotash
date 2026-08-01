import crypto from 'node:crypto';
import type pg from 'pg';
import { getPool } from './db.ts';
import { isResourceId, resourceName, type ResourceId } from './arrangements.ts';
import { insertBotBookingMessage } from './messaging.ts';

export const EVENT_TYPES = Object.freeze([
  'wedding', 'celebration', 'workshop', 'corporate', 'community', 'other',
] as const);

export type EventRequestInput = {
  name: string;
  email: string;
  telephone?: string;
  telephoneE164?: string | null;
  whatsappConsentRequested?: boolean;
  whatsappConsentVersion?: string | null;
  eventName: string;
  eventType: string;
  eventTypeOther?: string;
  description: string;
  eventStartAt: string;
  eventEndAt: string;
  setupStartAt: string;
  clearingEndAt: string;
  daytimeAttendees: number;
  overnightGuests: number;
  requestedResourceIds: string[];
  requestedAreasText?: string;
  accommodationRequired: boolean;
  accommodationNotes?: string;
  cateringRequirements?: string;
  parkingRequirements?: string;
  accessibilityRequirements?: string;
  equipmentRequirements?: string;
  publicAccess: boolean;
  amplifiedMusic: boolean;
  outsideSuppliers: boolean;
  budgetExpectation?: string;
  acknowledgement: boolean;
};

export type EventValidation = { valid: true; value: EventRequestInput } | { valid: false; errors: string[] };

function instant(value: string): number {
  return Date.parse(value);
}

export function validateEventRequest(input: EventRequestInput): EventValidation {
  const errors: string[] = [];
  const setup = instant(input.setupStartAt);
  const start = instant(input.eventStartAt);
  const end = instant(input.eventEndAt);
  const clearing = instant(input.clearingEndAt);
  if (input.name.trim().length < 2) errors.push('Enter the Booker name.');
  if (!/^\S+@\S+\.\S+$/.test(input.email.trim())) errors.push('Enter a valid email address.');
  if (input.eventName.trim().length < 2) errors.push('Enter an event name.');
  if (!EVENT_TYPES.includes(input.eventType as typeof EVENT_TYPES[number])) errors.push('Choose a valid event type.');
  if (input.eventType === 'other' && !input.eventTypeOther?.trim()) errors.push('Describe the event type.');
  if (!input.description.trim()) errors.push('Describe the proposed use.');
  if (![setup, start, end, clearing].every(Number.isFinite)) errors.push('Enter valid setup, event and clearing times.');
  else if (!(setup <= start && start < end && end <= clearing)) errors.push('Times must run from setup, through the event, to clearing.');
  if (!Number.isInteger(input.daytimeAttendees) || input.daytimeAttendees < 0) errors.push('Daytime attendees cannot be negative.');
  if (!Number.isInteger(input.overnightGuests) || input.overnightGuests < 0) errors.push('Overnight guests cannot be negative.');
  if (input.requestedResourceIds.some((id) => !isResourceId(id))) errors.push('Choose only recognised Olrig Bank areas.');
  if (!input.requestedResourceIds.length && !input.requestedAreasText?.trim()) errors.push('Choose at least one area or describe the area required.');
  if (!input.acknowledgement) errors.push('Acknowledge that this is an enquiry, not a confirmed reservation.');
  return errors.length ? { valid: false, errors } : { valid: true, value: input };
}

export async function createEventRequest(input: EventRequestInput): Promise<{ reference: string; accessToken: string }> {
  const validation = validateEventRequest(input);
  if (!validation.valid) throw new Error(`EVENT_VALIDATION:${validation.errors.join('|')}`);
  const value = validation.value;
  const accessToken = crypto.randomBytes(32).toString('base64url');
  const arrival = new Date(value.setupStartAt).toISOString().slice(0, 10);
  let departure = new Date(value.clearingEndAt).toISOString().slice(0, 10);
  if (departure <= arrival) departure = new Date(new Date(`${arrival}T12:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10);
  const originalSubmission = { ...value, submittedAt: new Date().toISOString() };
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO provisional_bookings (
         property_id, property_ref, booking_kind, booking_title, arrival, departure,
         guests, pets, guest_name, guest_email, guest_telephone, guest_telephone_e164,
         whatsapp_consent_status, whatsapp_consent_at, whatsapp_consent_source,
         whatsapp_consent_version, whatsapp_consent_number_e164, guest_message,
         customer_access_token
       ) VALUES (
         'whole-property', 'olrig-bank', 'event', $1, $2::date, $3::date,
         $4, 0, $5, $6, $7, $8, $9,
         CASE WHEN $9 = 'active' THEN NOW() END,
         CASE WHEN $9 = 'active' THEN 'event_request_form' END,
         CASE WHEN $9 = 'active' THEN $10 END,
         CASE WHEN $9 = 'active' THEN $8 END,
         $11, $12
       ) RETURNING id::text, public_id::text AS reference`,
      [
        value.eventName.trim(), arrival, departure, Math.max(1, value.overnightGuests),
        value.name.trim(), value.email.trim().toLowerCase(), value.telephone?.trim() || null,
        value.telephoneE164 || null, value.whatsappConsentRequested ? 'active' : 'not_requested',
        value.whatsappConsentVersion || null, value.description.trim(), accessToken,
      ],
    );
    const bookingId = result.rows[0].id;
    await client.query(
      `INSERT INTO event_details (
         provisional_booking_id, event_name, event_type, event_type_other, description,
         event_start_at, event_end_at, setup_start_at, clearing_end_at,
         daytime_attendees, overnight_guests, requested_resource_ids, requested_areas_text,
         accommodation_required, accommodation_notes, catering_requirements,
         parking_requirements, accessibility_requirements, equipment_requirements,
         public_access, amplified_music, outside_suppliers, budget_expectation,
         original_submission, working_details
       ) VALUES ($1,$2,$3,$4,$5,$6::timestamp AT TIME ZONE 'Europe/London',$7::timestamp AT TIME ZONE 'Europe/London',$8::timestamp AT TIME ZONE 'Europe/London',$9::timestamp AT TIME ZONE 'Europe/London',
         $10,$11,$12::text[],$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23::jsonb,$23::jsonb)`,
      [bookingId, value.eventName.trim(), value.eventType, value.eventTypeOther?.trim() || null,
        value.description.trim(), value.eventStartAt, value.eventEndAt, value.setupStartAt,
        value.clearingEndAt, value.daytimeAttendees, value.overnightGuests,
        value.requestedResourceIds, value.requestedAreasText?.trim() || null,
        value.accommodationRequired, value.accommodationNotes?.trim() || null,
        value.cateringRequirements?.trim() || null, value.parkingRequirements?.trim() || null,
        value.accessibilityRequirements?.trim() || null, value.equipmentRequirements?.trim() || null,
        value.publicAccess, value.amplifiedMusic, value.outsideSuppliers,
        value.budgetExpectation?.trim() || null, JSON.stringify(originalSubmission)],
    );
    await client.query(
      `INSERT INTO booking_activity (provisional_booking_id, actor, event_type, details)
       VALUES ($1, 'customer', 'event_requested', $2::jsonb)`,
      [bookingId, JSON.stringify({ eventName: value.eventName, requestedResourceIds: value.requestedResourceIds })],
    );
    await insertBotBookingMessage(client, {
      bookingId,
      body: 'Your event enquiry has been received. It is not yet a reservation. Jenna will review the requirements and any offer will appear here.',
      audience: 'booker',
      sourceKey: `event-request-received:${bookingId}`,
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

export type EventDetails = {
  eventName: string; eventType: string; eventTypeOther: string | null; description: string;
  eventStartAt: string; eventEndAt: string; setupStartAt: string; clearingEndAt: string;
  daytimeAttendees: number; overnightGuests: number; requestedResourceIds: string[];
  requestedAreasText: string | null; accommodationRequired: boolean; accommodationNotes: string | null;
  cateringRequirements: string | null; parkingRequirements: string | null;
  accessibilityRequirements: string | null; equipmentRequirements: string | null;
  publicAccess: boolean; amplifiedMusic: boolean; outsideSuppliers: boolean;
  budgetExpectation: string | null; originalSubmission: Record<string, unknown>;
};

export async function getEventDetails(reference: string): Promise<EventDetails | null> {
  const result = await getPool().query(
    `SELECT ed.event_name AS "eventName", ed.event_type AS "eventType", ed.event_type_other AS "eventTypeOther",
            ed.description, ed.event_start_at AS "eventStartAt", ed.event_end_at AS "eventEndAt",
            ed.setup_start_at AS "setupStartAt", ed.clearing_end_at AS "clearingEndAt",
            ed.daytime_attendees AS "daytimeAttendees", ed.overnight_guests AS "overnightGuests",
            ed.requested_resource_ids AS "requestedResourceIds", ed.requested_areas_text AS "requestedAreasText",
            ed.accommodation_required AS "accommodationRequired", ed.accommodation_notes AS "accommodationNotes",
            ed.catering_requirements AS "cateringRequirements", ed.parking_requirements AS "parkingRequirements",
            ed.accessibility_requirements AS "accessibilityRequirements", ed.equipment_requirements AS "equipmentRequirements",
            ed.public_access AS "publicAccess", ed.amplified_music AS "amplifiedMusic",
            ed.outside_suppliers AS "outsideSuppliers", ed.budget_expectation AS "budgetExpectation",
            ed.original_submission AS "originalSubmission"
       FROM event_details ed JOIN provisional_bookings pb ON pb.id = ed.provisional_booking_id
      WHERE pb.public_id = $1::uuid`, [reference],
  );
  if (!result.rowCount) return null;
  const row = result.rows[0];
  for (const key of ['eventStartAt', 'eventEndAt', 'setupStartAt', 'clearingEndAt']) row[key] = new Date(row[key]).toISOString();
  return row;
}

export type AllocationInput = { resourceId: ResourceId; startAt: string; endAt: string };

export async function replaceBlockingAllocations(input: {
  reference: string;
  allocations: AllocationInput[];
  state: 'hold' | 'offered' | 'accepted' | 'confirmed';
  holdExpiresAt?: string | null;
  actor?: string;
}): Promise<void> {
  if (!input.allocations.length) throw new Error('ALLOCATIONS_REQUIRED');
  if (input.state === 'hold' && (!input.holdExpiresAt || !Number.isFinite(instant(input.holdExpiresAt)) || instant(input.holdExpiresAt) <= Date.now())) {
    throw new Error('INVALID_HOLD_EXPIRY');
  }
  for (const allocation of input.allocations) {
    if (!isResourceId(allocation.resourceId) || !Number.isFinite(instant(allocation.startAt)) ||
        !Number.isFinite(instant(allocation.endAt)) || instant(allocation.endAt) <= instant(allocation.startAt)) {
      throw new Error('INVALID_ALLOCATION');
    }
  }
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const booking = await client.query('SELECT id FROM provisional_bookings WHERE public_id = $1::uuid FOR UPDATE', [input.reference]);
    if (!booking.rowCount) throw new Error('BOOKING_NOT_FOUND');
    const bookingId = booking.rows[0].id;
    const lockKeys = [...new Set(input.allocations.map((allocation) => allocation.resourceId))].sort();
    for (const resourceId of lockKeys) await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`resource:${resourceId}`]);
    await client.query(
      `UPDATE booking_resource_allocations SET allocation_state = 'released', updated_at = NOW()
       WHERE provisional_booking_id = $1 AND allocation_state <> 'released'`, [bookingId],
    );
    for (const allocation of input.allocations) {
      await client.query(
        `INSERT INTO booking_resource_allocations
           (provisional_booking_id, resource_id, start_at, end_at, allocation_state, purpose, hold_expires_at)
         VALUES ($1,$2,$3::timestamp AT TIME ZONE 'Europe/London',$4::timestamp AT TIME ZONE 'Europe/London',$5,'event',$6::timestamp AT TIME ZONE 'Europe/London')`,
        [bookingId, allocation.resourceId, allocation.startAt, allocation.endAt, input.state, input.holdExpiresAt || null],
      );
    }
    await client.query(
      `INSERT INTO booking_activity (provisional_booking_id, actor, event_type, details)
       VALUES ($1, 'administrator', 'resource_allocations_changed', $2::jsonb)`,
      [bookingId, JSON.stringify({ state: input.state, holdExpiresAt: input.holdExpiresAt || null, allocations: input.allocations })],
    );
    await client.query('COMMIT');
  } catch (error: any) {
    await client.query('ROLLBACK');
    if (error?.code === '23P01') throw new Error('RESOURCE_CONFLICT');
    throw error;
  } finally { client.release(); }
}

export async function expireElapsedAllocationHolds(database: Pick<pg.Pool, 'query'> = getPool()): Promise<number> {
  const result = await database.query(
    `UPDATE booking_resource_allocations SET allocation_state = 'released', updated_at = NOW()
      WHERE allocation_state = 'hold' AND hold_expires_at IS NOT NULL AND hold_expires_at <= NOW()`,
  );
  return result.rowCount || 0;
}

export async function getBookingAllocations(reference: string) {
  await expireElapsedAllocationHolds();
  const result = await getPool().query(
    `SELECT bra.public_id::text AS id, bra.resource_id AS "resourceId", r.name AS "resourceName",
            bra.start_at AS "startAt", bra.end_at AS "endAt", bra.allocation_state AS state,
            bra.hold_expires_at AS "holdExpiresAt"
       FROM booking_resource_allocations bra
       JOIN resources r ON r.id = bra.resource_id
       JOIN provisional_bookings pb ON pb.id = bra.provisional_booking_id
      WHERE pb.public_id = $1::uuid AND bra.allocation_state <> 'released'
      ORDER BY bra.start_at, r.name`, [reference],
  );
  return result.rows.map((row) => ({ ...row, startAt: new Date(row.startAt).toISOString(), endAt: new Date(row.endAt).toISOString(),
    holdExpiresAt: row.holdExpiresAt ? new Date(row.holdExpiresAt).toISOString() : null }));
}

export async function updateEventWorkingDetails(reference: string, input: {
  eventName: string; description: string; setupStartAt: string; eventStartAt: string;
  eventEndAt: string; clearingEndAt: string; daytimeAttendees: number; overnightGuests: number;
  cateringRequirements?: string; parkingRequirements?: string; accessibilityRequirements?: string;
  equipmentRequirements?: string; accommodationNotes?: string;
}): Promise<void> {
  const setup = instant(input.setupStartAt), start = instant(input.eventStartAt);
  const end = instant(input.eventEndAt), clearing = instant(input.clearingEndAt);
  if (!input.eventName.trim() || !input.description.trim() || ![setup, start, end, clearing].every(Number.isFinite)
      || !(setup <= start && start < end && end <= clearing)
      || !Number.isInteger(input.daytimeAttendees) || input.daytimeAttendees < 0
      || !Number.isInteger(input.overnightGuests) || input.overnightGuests < 0) throw new Error('INVALID_EVENT_DETAILS');
  const details = { ...input, updatedAt: new Date().toISOString() };
  const result = await getPool().query(
    `WITH booking AS (SELECT id FROM provisional_bookings WHERE public_id = $1::uuid)
     UPDATE event_details ed SET event_name=$2, description=$3, setup_start_at=$4::timestamp AT TIME ZONE 'Europe/London',
       event_start_at=$5::timestamp AT TIME ZONE 'Europe/London', event_end_at=$6::timestamp AT TIME ZONE 'Europe/London', clearing_end_at=$7::timestamp AT TIME ZONE 'Europe/London',
       daytime_attendees=$8, overnight_guests=$9, catering_requirements=$10,
       parking_requirements=$11, accessibility_requirements=$12, equipment_requirements=$13,
       accommodation_notes=$14, working_details=$15::jsonb, updated_at=NOW()
     FROM booking WHERE ed.provisional_booking_id=booking.id RETURNING ed.provisional_booking_id`,
    [reference, input.eventName.trim(), input.description.trim(), input.setupStartAt, input.eventStartAt,
      input.eventEndAt, input.clearingEndAt, input.daytimeAttendees, input.overnightGuests,
      input.cateringRequirements?.trim() || null, input.parkingRequirements?.trim() || null,
      input.accessibilityRequirements?.trim() || null, input.equipmentRequirements?.trim() || null,
      input.accommodationNotes?.trim() || null, JSON.stringify(details)],
  );
  if (!result.rowCount) throw new Error('EVENT_NOT_FOUND');
  await getPool().query(
    `INSERT INTO booking_activity (provisional_booking_id, actor, event_type, details)
     SELECT id,'administrator','event_working_details_changed',$2::jsonb FROM provisional_bookings WHERE public_id=$1::uuid`,
    [reference, JSON.stringify({ eventName: input.eventName })],
  );
}

export async function releaseBookingAllocations(reference: string): Promise<void> {
  await getPool().query(
    `UPDATE booking_resource_allocations bra SET allocation_state='released', updated_at=NOW()
      FROM provisional_bookings pb WHERE pb.id=bra.provisional_booking_id AND pb.public_id=$1::uuid`,
    [reference],
  );
}

export function allocationConflictMessage(resourceId: string): string {
  return `${resourceName(resourceId)} is already allocated during part of that period.`;
}
