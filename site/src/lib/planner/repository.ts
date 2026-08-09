import type { Pool, PoolClient } from 'pg';
import { createParticipantCredential } from './participant-access.ts';
import { createShareCredential } from './share-access.ts';
import { createAiCapabilityCredential } from './ai-capability-access.ts';
import { AI_PLAN_VERSION } from './ai-representation.ts';
import { getPool } from '../booking/db.ts';
import {
  PLAN_ITEM_STATUSES,
  PLAN_ITEM_TYPES,
  PLAN_ITEM_VISIBILITIES,
  PlannerError,
  optionalText,
  requireText,
  validateDate,
  validateGuideSlug,
  validatePublicId,
  validateTime,
  validateItemStatusTransition,
  type HolidayPlan,
  type HolidayPlanSummary,
  type GuideContributionCandidate,
  type GuideContributionModerationCandidate,
  type BookerPlanActor,
  type PlanActor,
  type PlannerRevisionActor,
  type PlanCandidateActivity,
  type PlanDay,
  type PlanItem,
  type PlanItemStatus,
  type PlanItemType,
  type PlanItemVisibility,
  type PlanRevision,
} from './types.ts';

type Database = Pick<Pool, 'query' | 'connect'>;

export type PlanParticipant = {
  id: string;
  displayName: string;
  email: string | null;
  role: 'owner' | 'editor' | 'contributor' | 'viewer';
  acceptedAt: string | null;
  revokedAt: string | null;
};

export type PlanShareLink = { id:string; expiresAt:string; revokedAt:string|null; lastAccessedAt:string|null; createdAt:string };
export type PlanAiCapability = { id:string; protocolVersion:string; scopes:string[]; createdPlanRevision:number; expiresAt:string; revokedAt:string|null; lastAccessedAt:string|null; createdAt:string };

function actorAdminUserId(actor: PlannerRevisionActor): string | null {
  return actor.type === 'administrator' ? actor.adminUserId : null;
}

function actorParticipantId(actor: PlannerRevisionActor): string | null {
  return actor.type === 'participant' ? actor.participantId : null;
}

function validateSourceUrl(value: string | null | undefined, required = false): string | null {
  const clean = value?.trim() ?? '';
  if (!clean) {
    if (required) throw new PlannerError('VALIDATION_ERROR', 'Activity webpage URL is required.');
    return null;
  }
  if (clean.length > 2000) throw new PlannerError('VALIDATION_ERROR', 'Activity webpage URL is too long.');
  try {
    const parsed = new URL(clean);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('protocol');
    return parsed.toString();
  } catch {
    throw new PlannerError('VALIDATION_ERROR', 'Activity webpage URL must be a valid HTTP or HTTPS address.');
  }
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function date(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function time(value: string | null): string | null {
  return value === null ? null : value.slice(0, 5);
}

async function selectableGuideReference(client: PoolClient, entryId: string | null | undefined): Promise<{ internalId: string; slug: string } | null> {
  if (entryId == null || entryId.trim() === '') return null;
  const result = await client.query<{ id: string | number; canonical_slug: string }>(
    `SELECT id, canonical_slug FROM local_guide_entries
      WHERE public_id=$1::uuid AND status='published'`, [validatePublicId(entryId, 'Local Guide entry identifier')],
  );
  if (!result.rowCount) throw new PlannerError('VALIDATION_ERROR', 'The selected Local Guide entry is unavailable.');
  return { internalId: String(result.rows[0].id), slug: result.rows[0].canonical_slug };
}

async function recordRevision(
  client: PoolClient,
  planInternalId: string,
  revision: number,
  actor: PlannerRevisionActor,
  action: string,
  summary: string,
  changes: Record<string, unknown>,
): Promise<void> {
  const administrator = actor.type === 'administrator';
  await client.query(
    `INSERT INTO plan_revisions
       (holiday_plan_id, revision, actor_type, admin_user_id, participant_id, source, action, summary, changes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
    [planInternalId, revision, administrator ? 'administrator' : 'guest',
      administrator ? actor.adminUserId : null, actorParticipantId(actor), administrator ? 'admin' : 'guest',
      action, summary, JSON.stringify(changes)],
  );
}

export async function getBookingLinkedPlanByBookingReference(
  bookingReference: string,
  database: Pick<Pool, 'query'> = getPool(),
): Promise<HolidayPlan | null> {
  const result = await database.query<{ public_id: string }>(
    `SELECT p.public_id::text
       FROM holiday_plans p
       JOIN provisional_bookings b ON b.id = p.booking_id
      WHERE b.public_id = $1::uuid AND p.plan_type = 'booking_linked'`,
    [validatePublicId(bookingReference, 'Booking reference')],
  );
  return result.rowCount ? getHolidayPlan(result.rows[0].public_id, database) : null;
}

export async function createBookingLinkedPlan(
  input: { bookingReference: string; actor: PlannerRevisionActor },
  database: Database = getPool(),
): Promise<HolidayPlan> {
  const bookingReference = validatePublicId(input.bookingReference, 'Booking reference');
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    const booking = await client.query<any>(
      `SELECT id, public_id::text, guest_name AS name, arrival, departure, status
         FROM provisional_bookings WHERE public_id = $1::uuid FOR UPDATE`, [bookingReference],
    );
    if (!booking.rowCount) throw new PlannerError('NOT_FOUND', 'Eligible booking not found.');
    const row = booking.rows[0];
    if (!['confirmed', 'approved'].includes(row.status)) {
      throw new PlannerError('VALIDATION_ERROR', 'A holiday plan can be created after the booking is confirmed.');
    }
    if (input.actor.type === 'booker' && input.actor.bookingId !== String(row.id)) {
      throw new PlannerError('NOT_FOUND', 'Eligible booking not found.');
    }
    const existing = await client.query('SELECT 1 FROM holiday_plans WHERE booking_id = $1', [row.id]);
    if (existing.rowCount) throw new PlannerError('VALIDATION_ERROR', 'This booking already has a holiday plan.');
    const administratorId = input.actor.type === 'administrator' ? input.actor.adminUserId : null;
    const title = `${row.name}'s holiday plan`;
    const created = await client.query<{ id: string | number; public_id: string }>(
      `INSERT INTO holiday_plans
         (plan_type, booking_id, title, starts_on, ends_on, duration_days,
          created_by_admin_user_id, updated_by_admin_user_id)
       VALUES ('booking_linked', $1, $2, $3::date, $4::date, ($4::date - $3::date) + 1, $5, $5)
       RETURNING id, public_id::text`,
      [row.id, title, row.arrival, row.departure, administratorId],
    );
    const planInternalId = String(created.rows[0].id);
    await client.query(
      `INSERT INTO plan_days (holiday_plan_id,day_date,title,summary,position,created_by_admin_user_id,updated_by_admin_user_id)
       SELECT $1,$2::date+day.day_number,'Day '||(day.day_number+1),'',(day.day_number+1)*10,$4,$4
         FROM generate_series(0,$3::date-$2::date) AS day(day_number)`,
      [planInternalId,row.arrival,row.departure,administratorId],
    );
    await client.query(
      `INSERT INTO plan_participants
         (holiday_plan_id, role, participant_type, booking_id, display_name)
       VALUES ($1, 'owner', 'booker', $2, $3)`, [planInternalId, row.id, row.name],
    );
    await recordRevision(client, planInternalId, 1, input.actor, 'booking_plan_created',
      'Created a holiday plan with one section for each day of the stay.',
      { bookingReference, initialState: 'dated_days' });
    await client.query(
      `INSERT INTO booking_activity (provisional_booking_id, actor, event_type, details)
       VALUES ($1, $2, 'holiday_plan_created', $3::jsonb)`,
      [row.id, input.actor.type === 'administrator' ? 'administrator' : 'customer',
        JSON.stringify({ planId: created.rows[0].public_id, adminUserId: administratorId })],
    );
    await client.query('COMMIT');
    const plan = await getHolidayPlan(created.rows[0].public_id, database);
    if (!plan) throw new PlannerError('NOT_FOUND', 'Created holiday plan could not be read.');
    return plan;
  } catch (error) {
    await client.query('ROLLBACK');
    if ((error as { code?: string; constraint?: string }).code === '23505'
      && (error as { constraint?: string }).constraint === 'holiday_plans_booking_idx') {
      throw new PlannerError('VALIDATION_ERROR', 'This booking already has a holiday plan.');
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function copyPublishedExampleIntoBookingPlan(
  input: {
    bookingReference: string;
    sourcePlanId: string;
    expectedRevision: number;
    actor: PlannerRevisionActor;
  },
  database: Database = getPool(),
): Promise<HolidayPlan> {
  const bookingReference = validatePublicId(input.bookingReference, 'Booking reference');
  const sourcePlanId = validatePublicId(input.sourcePlanId, 'Example plan identifier');
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    const target = await client.query<any>(
      `SELECT p.id, p.public_id::text, p.revision, p.starts_on, p.duration_days, p.booking_id::text
         FROM holiday_plans p
         JOIN provisional_bookings b ON b.id = p.booking_id
        WHERE b.public_id = $1::uuid AND p.plan_type = 'booking_linked'
        FOR UPDATE OF p`, [bookingReference],
    );
    if (!target.rowCount) throw new PlannerError('NOT_FOUND', 'Booking holiday plan not found.');
    const destination = target.rows[0];
    if (input.actor.type === 'booker' && input.actor.bookingId !== destination.booking_id) {
      throw new PlannerError('NOT_FOUND', 'Booking holiday plan not found.');
    }
    if (destination.revision !== input.expectedRevision) {
      throw new PlannerError('STALE_REVISION', 'The holiday plan has changed. Reload it before copying.');
    }
    const existingItems = await client.query('SELECT 1 FROM plan_items i JOIN plan_days d ON d.id=i.plan_day_id WHERE d.holiday_plan_id=$1 LIMIT 1',[destination.id]);
    if(existingItems.rowCount)throw new PlannerError('VALIDATION_ERROR','An example can only be copied into a plan with no scheduled activities.');
    const source = await client.query<any>(
      `SELECT id, public_id::text, title, public_slug
         FROM holiday_plans
        WHERE public_id = $1::uuid AND plan_type = 'example' AND publication_status = 'published'
          AND visibility = 'public' AND archived_at IS NULL
        FOR SHARE`, [sourcePlanId],
    );
    if (!source.rowCount) throw new PlannerError('NOT_FOUND', 'Published example plan not found.');
    const sourceDays = await client.query<any>(
      'SELECT * FROM plan_days WHERE holiday_plan_id = $1 ORDER BY position', [source.rows[0].id],
    );
    if (sourceDays.rows.length > Number(destination.duration_days)) {
      throw new PlannerError('VALIDATION_ERROR', 'This example has more days than the booked stay.');
    }
    const targetDays=await client.query<any>('SELECT * FROM plan_days WHERE holiday_plan_id=$1 ORDER BY position FOR UPDATE',[destination.id]);
    for (let index = 0; index < sourceDays.rows.length; index += 1) {
      const day = sourceDays.rows[index];
      const copiedDay=targetDays.rows[index];
      await client.query('UPDATE plan_days SET title=$2,summary=$3,updated_by_admin_user_id=$4,updated_at=NOW() WHERE id=$1',[copiedDay.id,day.title,day.summary,input.actor.type==='administrator'?input.actor.adminUserId:null]);
      await client.query(
        `INSERT INTO plan_items
           (plan_day_id, title, description, item_type, start_time, end_time, location_text,
            source_url, local_guide_entry_id, status, position, reservation_note, visibility,
            created_by_admin_user_id, updated_by_admin_user_id)
         SELECT $1, title, description, item_type, start_time, end_time, location_text,
                source_url, local_guide_entry_id, 'idea', position, NULL, 'participants', $2, $2
           FROM plan_items WHERE plan_day_id = $3 AND visibility <> 'private' ORDER BY position`,
        [copiedDay.id, input.actor.type === 'administrator' ? input.actor.adminUserId : null, day.id],
      );
    }
    const revision = destination.revision + 1;
    await client.query(
      `UPDATE holiday_plans SET revision = $2, updated_by_admin_user_id = $3, updated_at = NOW()
        WHERE id = $1`,
      [destination.id, revision, input.actor.type === 'administrator' ? input.actor.adminUserId : null],
    );
    await recordRevision(client, String(destination.id), revision, input.actor, 'example_plan_copied',
      `Copied published example plan “${source.rows[0].title}”.`,
      { sourcePlanId, sourcePublicSlug: source.rows[0].public_slug, copiedDays: sourceDays.rows.length });
    await client.query(
      `INSERT INTO booking_activity (provisional_booking_id, actor, event_type, details)
       VALUES ($1, $2, 'holiday_plan_example_copied', $3::jsonb)`,
      [destination.booking_id, input.actor.type === 'administrator' ? 'administrator' : 'customer',
        JSON.stringify({ planId: destination.public_id, sourcePlanId, revision })],
    );
    await client.query('COMMIT');
    const plan = await getHolidayPlan(destination.public_id, database);
    if (!plan) throw new PlannerError('NOT_FOUND', 'Copied holiday plan could not be read.');
    return plan;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function lockPlan(
  client: PoolClient,
  planId: string,
  expectedRevision: number,
  actor: PlannerRevisionActor,
): Promise<{ internalId: string; revision: number }> {
  const result = await client.query<{ id: string | number; revision: number; booking_id: string | number | null; plan_type: string }>(
    'SELECT id, revision, booking_id, plan_type FROM holiday_plans WHERE public_id = $1::uuid FOR UPDATE',
    [validatePublicId(planId, 'Plan identifier')],
  );
  if (!result.rowCount) throw new PlannerError('NOT_FOUND', 'Holiday plan not found.');
  if (actor.type === 'booker'
    && (result.rows[0].plan_type !== 'booking_linked' || String(result.rows[0].booking_id) !== actor.bookingId)) {
    throw new PlannerError('NOT_FOUND', 'Holiday plan not found.');
  }
  if (actor.type === 'participant') {
    if (actor.planId !== planId || result.rows[0].plan_type !== 'booking_linked') {
      throw new PlannerError('NOT_FOUND', 'Holiday plan not found.');
    }
    const participant = await client.query(
      `SELECT 1 FROM plan_participants
        WHERE id = $1 AND holiday_plan_id = $2 AND role = $3
          AND participant_type = 'guest' AND revoked_at IS NULL`,
      [actor.participantId, result.rows[0].id, actor.role],
    );
    if (!participant.rowCount) throw new PlannerError('NOT_FOUND', 'Holiday plan not found.');
  }
  if (result.rows[0].revision !== expectedRevision) {
    throw new PlannerError('STALE_REVISION', 'The holiday plan has changed. Reload it before saving.');
  }
  return { internalId: String(result.rows[0].id), revision: result.rows[0].revision };
}

async function finishMutation(
  client: PoolClient,
  planInternalId: string,
  currentRevision: number,
  actor: PlannerRevisionActor,
  action: string,
  summary: string,
  changes: Record<string, unknown>,
): Promise<number> {
  const revision = currentRevision + 1;
  await client.query(
    `UPDATE holiday_plans
        SET revision = $2, updated_by_admin_user_id = $3, updated_at = NOW()
      WHERE id = $1`,
    [planInternalId, revision, actorAdminUserId(actor)],
  );
  await recordRevision(client, planInternalId, revision, actor, action, summary, changes);
  return revision;
}

export async function createExamplePlan(
  input: {
    title: string;
    description?: string;
    startsOn?: string | null;
    endsOn?: string | null;
    durationDays?: number | null;
    actor: PlanActor;
  },
  database: Database = getPool(),
): Promise<HolidayPlan> {
  const title = requireText(input.title, 'Plan title', 160, 3);
  const description = input.description?.trim() ?? '';
  if (description.length > 5000) throw new PlannerError('VALIDATION_ERROR', 'Plan description is too long.');
  const startsOn = validateDate(input.startsOn, 'Plan start date');
  const endsOn = validateDate(input.endsOn, 'Plan end date');
  if ((startsOn === null) !== (endsOn === null)) {
    throw new PlannerError('VALIDATION_ERROR', 'Plan start and end dates must be supplied together.');
  }
  if (startsOn && endsOn && endsOn < startsOn) {
    throw new PlannerError('VALIDATION_ERROR', 'Plan end date cannot precede its start date.');
  }
  if (input.durationDays != null && (!Number.isInteger(input.durationDays) || input.durationDays < 1 || input.durationDays > 366)) {
    throw new PlannerError('VALIDATION_ERROR', 'Plan duration must be between 1 and 366 days.');
  }

  const client = await database.connect();
  try {
    await client.query('BEGIN');
    const created = await client.query<{ id: string | number; public_id: string }>(
      `INSERT INTO holiday_plans
         (plan_type, title, description, starts_on, ends_on, duration_days,
          created_by_admin_user_id, updated_by_admin_user_id)
       VALUES ('example', $1, $2, $3::date, $4::date, $5, $6, $6)
       RETURNING id, public_id::text`,
      [title, description, startsOn, endsOn, input.durationDays ?? null, input.actor.adminUserId],
    );
    await recordRevision(client, String(created.rows[0].id), 1, input.actor, 'plan_created', `Created example plan “${title}”.`, { title });
    await client.query('COMMIT');
    const plan = await getHolidayPlan(created.rows[0].public_id, database);
    if (!plan) throw new PlannerError('NOT_FOUND', 'Created holiday plan could not be read.');
    return plan;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function addPlanDay(
  input: { planId: string; expectedRevision: number; title: string; summary?: string; date?: string | null; actor: PlannerRevisionActor },
  database: Database = getPool(),
): Promise<{ dayId: string; revision: number }> {
  const title = requireText(input.title, 'Day title', 160);
  const summary = input.summary?.trim() ?? '';
  if (summary.length > 3000) throw new PlannerError('VALIDATION_ERROR', 'Day summary is too long.');
  const dayDate = validateDate(input.date, 'Plan day date');
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    const plan = await lockPlan(client, input.planId, input.expectedRevision, input.actor);
    await requireCompatibleDayDate(client, plan.internalId, dayDate);
    const created = await client.query<{ public_id: string }>(
      `INSERT INTO plan_days
         (holiday_plan_id, day_date, title, summary, position, created_by_admin_user_id, updated_by_admin_user_id)
       VALUES ($1, $2::date, $3, $4,
         COALESCE((SELECT max(position) + 10 FROM plan_days WHERE holiday_plan_id = $1), 10), $5, $5)
       RETURNING public_id::text`,
      [plan.internalId, dayDate, title, summary, actorAdminUserId(input.actor)],
    );
    const revision = await finishMutation(client, plan.internalId, plan.revision, input.actor, 'day_added', `Added day “${title}”.`, { dayId: created.rows[0].public_id, title });
    await client.query('COMMIT');
    return { dayId: created.rows[0].public_id, revision };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function addPlanItem(
  input: {
    planId: string;
    dayId: string;
    expectedRevision: number;
    title: string;
    description?: string;
    itemType: PlanItemType;
    startTime?: string | null;
    endTime?: string | null;
    locationText?: string | null;
    localGuideEntryId?: string | null;
    status?: PlanItemStatus;
    reservationNote?: string | null;
    visibility?: PlanItemVisibility;
    sourceUrl?: string | null;
    actor: PlannerRevisionActor;
  },
  database: Database = getPool(),
): Promise<{ itemId: string; revision: number }> {
  const title = requireText(input.title, 'Item title', 200);
  const description = input.description?.trim() ?? '';
  if (description.length > 10000) throw new PlannerError('VALIDATION_ERROR', 'Item description is too long.');
  if (!PLAN_ITEM_TYPES.includes(input.itemType)) throw new PlannerError('VALIDATION_ERROR', 'Plan item type is invalid.');
  const status = input.status ?? 'idea';
  const visibility = input.visibility ?? 'participants';
  if (!PLAN_ITEM_STATUSES.includes(status)) throw new PlannerError('VALIDATION_ERROR', 'Plan item status is invalid.');
  if (!PLAN_ITEM_VISIBILITIES.includes(visibility)) throw new PlannerError('VALIDATION_ERROR', 'Plan item visibility is invalid.');
  const startTime = validateTime(input.startTime, 'Item start time');
  const endTime = validateTime(input.endTime, 'Item end time');
  const sourceUrl = validateSourceUrl(input.sourceUrl);
  if (startTime && endTime && endTime <= startTime) {
    throw new PlannerError('VALIDATION_ERROR', 'Item end time must be after its start time.');
  }
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    const plan = await lockPlan(client, input.planId, input.expectedRevision, input.actor);
    const guide = await selectableGuideReference(client, input.localGuideEntryId);
    const created = await client.query<{ public_id: string }>(
      `INSERT INTO plan_items
         (plan_day_id, title, description, item_type, start_time, end_time, location_text,
          source_url, local_guide_entry_id, status, position, reservation_note, visibility,
          created_by_admin_user_id, updated_by_admin_user_id)
       SELECT d.id, $3, $4, $5, $6::time, $7::time, $8, $9, $10, $11,
              COALESCE((SELECT max(position) + 10 FROM plan_items WHERE plan_day_id = d.id), 10),
              $12, $13, $14, $14
         FROM plan_days d
        WHERE d.public_id = $1::uuid AND d.holiday_plan_id = $2
       RETURNING public_id::text`,
      [validatePublicId(input.dayId, 'Plan day identifier'), plan.internalId, title, description, input.itemType, startTime,
        endTime, optionalText(input.locationText, 'Location', 500), sourceUrl,
        guide?.internalId ?? null, status,
        optionalText(input.reservationNote, 'Reservation note', 3000), visibility, actorAdminUserId(input.actor)],
    );
    if (!created.rowCount) throw new PlannerError('NOT_FOUND', 'Plan day not found.');
    const revision = await finishMutation(client, plan.internalId, plan.revision, input.actor, 'item_added', `Added item “${title}”.`, { dayId: input.dayId, itemId: created.rows[0].public_id, title });
    await client.query('COMMIT');
    return { itemId: created.rows[0].public_id, revision };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getHolidayPlan(planId: string, database: Pick<Pool, 'query'> = getPool()): Promise<HolidayPlan | null> {
  const plans = await database.query<any>('SELECT * FROM holiday_plans WHERE public_id = $1::uuid', [validatePublicId(planId, 'Plan identifier')]);
  if (!plans.rowCount) return null;
  const row = plans.rows[0];
  const daysResult = await database.query<any>(
    `SELECT d.*, COALESCE(jsonb_agg(jsonb_build_object(
       'id', i.public_id::text, 'title', i.title, 'description', i.description,
       'itemType', i.item_type, 'startTime', to_char(i.start_time, 'HH24:MI'),
       'endTime', to_char(i.end_time, 'HH24:MI'), 'locationText', i.location_text,
       'sourceUrl', i.source_url,
       'localGuideEntryId', guide.public_id::text, 'localGuideSlug', guide.canonical_slug,
       'status', i.status, 'position', i.position,
       'reservationNote', i.reservation_note, 'visibility', i.visibility
     ) ORDER BY i.position) FILTER (WHERE i.id IS NOT NULL), '[]'::jsonb) AS items
       FROM plan_days d LEFT JOIN plan_items i ON i.plan_day_id = d.id
       LEFT JOIN local_guide_entries guide ON guide.id = i.local_guide_entry_id
      WHERE d.holiday_plan_id = $1 GROUP BY d.id ORDER BY d.position`,
    [row.id],
  );
  const revisionsResult = await database.query<any>(
    `SELECT r.*,
            COALESCE(au.display_name, participant.display_name, owner.display_name,
              CASE r.actor_type WHEN 'external_ai' THEN 'External AI' ELSE 'Olrig Bank system' END) AS actor_display_name
       FROM plan_revisions r
       LEFT JOIN admin_users au ON au.id = r.admin_user_id
       LEFT JOIN plan_participants participant ON participant.id = r.participant_id
       LEFT JOIN LATERAL (
         SELECT display_name FROM plan_participants
          WHERE holiday_plan_id = r.holiday_plan_id AND role = 'owner'
          LIMIT 1
       ) owner ON r.actor_type = 'guest' AND r.participant_id IS NULL
      WHERE r.holiday_plan_id = $1 ORDER BY r.revision`, [row.id],
  );
  const candidatesResult = await database.query<any>(
    `SELECT c.public_id::text, c.title, c.description, c.source_url, c.position,
            guide.public_id::text AS local_guide_entry_id, guide.canonical_slug AS local_guide_slug
       FROM plan_candidate_activities c
       LEFT JOIN local_guide_entries guide ON guide.id = c.local_guide_entry_id
      WHERE c.holiday_plan_id = $1 ORDER BY c.position`, [row.id],
  );
  const days: PlanDay[] = daysResult.rows.map((dayRow: any) => ({
    id: String(dayRow.public_id), date: date(dayRow.day_date), title: dayRow.title,
    summary: dayRow.summary, position: dayRow.position,
    items: dayRow.items.map((item: PlanItem) => ({ ...item, startTime: time(item.startTime), endTime: time(item.endTime) })),
  }));
  const revisions: PlanRevision[] = revisionsResult.rows.map((revisionRow: any) => ({
    revision: revisionRow.revision, actorType: revisionRow.actor_type,
    adminUserId: revisionRow.admin_user_id == null ? null : String(revisionRow.admin_user_id),
    participantId: revisionRow.participant_id == null ? null : String(revisionRow.participant_id),
    actorDisplayName: revisionRow.actor_display_name,
    source: revisionRow.source, action: revisionRow.action, summary: revisionRow.summary,
    changes: revisionRow.changes, createdAt: iso(revisionRow.created_at),
  }));
  const candidates: PlanCandidateActivity[] = candidatesResult.rows.map((candidate: any) => ({
    id: candidate.public_id, title: candidate.title, description: candidate.description,
    sourceUrl: candidate.source_url, localGuideEntryId: candidate.local_guide_entry_id,
    localGuideSlug: candidate.local_guide_slug, position: candidate.position,
  }));
  return {
    id: String(row.public_id), planType: row.plan_type,
    bookingId: row.booking_id == null ? null : String(row.booking_id), title: row.title,
    description: row.description, publicationStatus: row.publication_status,
    visibility: row.visibility, publicSlug: row.public_slug, startsOn: date(row.starts_on), endsOn: date(row.ends_on),
    durationDays: row.duration_days, revision: row.revision,
    archivedAt: row.archived_at ? iso(row.archived_at) : null,
    createdAt: iso(row.created_at), updatedAt: iso(row.updated_at), days, candidates, revisions,
  };
}

export async function listExamplePlans(
  database: Pick<Pool, 'query'> = getPool(),
): Promise<HolidayPlanSummary[]> {
  const result = await database.query<any>(
    `SELECT p.*, count(d.id)::int AS day_count
       FROM holiday_plans p
       LEFT JOIN plan_days d ON d.holiday_plan_id = p.id
      WHERE p.plan_type = 'example'
      GROUP BY p.id
      ORDER BY (p.archived_at IS NOT NULL), p.updated_at DESC`,
  );
  return result.rows.map((row: any) => ({
    id: String(row.public_id), planType: row.plan_type,
    bookingId: null, title: row.title, description: row.description,
    publicationStatus: row.publication_status, visibility: row.visibility,
    publicSlug: row.public_slug,
    startsOn: date(row.starts_on), endsOn: date(row.ends_on),
    durationDays: row.duration_days, revision: row.revision,
    archivedAt: row.archived_at ? iso(row.archived_at) : null,
    createdAt: iso(row.created_at), updatedAt: iso(row.updated_at),
    dayCount: row.day_count,
  }));
}

export async function duplicateExamplePlan(
  input: { planId: string; actor: PlanActor },
  database: Database = getPool(),
): Promise<HolidayPlan> {
  validatePublicId(input.planId, 'Plan identifier');
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    const source = await client.query<any>(
      `SELECT * FROM holiday_plans WHERE public_id=$1::uuid AND plan_type='example' FOR SHARE`, [input.planId]);
    if(!source.rowCount) throw new PlannerError('NOT_FOUND','Example plan not found.');
    const original=source.rows[0];
    const created=await client.query<{id:string|number;public_id:string}>(
      `INSERT INTO holiday_plans(plan_type,title,description,publication_status,visibility,starts_on,ends_on,duration_days,revision,created_by_admin_user_id,updated_by_admin_user_id)
       VALUES('example',$1,$2,'draft','private',$3,$4,$5,1,$6,$6) RETURNING id,public_id::text`,
      [`${original.title} — copy`,original.description,original.starts_on,original.ends_on,original.duration_days,input.actor.adminUserId]);
    const targetId=String(created.rows[0].id);
    const sourceDays=await client.query<any>('SELECT * FROM plan_days WHERE holiday_plan_id=$1 ORDER BY position',[original.id]);
    for(const day of sourceDays.rows){
      const newDay=await client.query<{id:string|number}>(`INSERT INTO plan_days(holiday_plan_id,day_date,title,summary,position,created_by_admin_user_id,updated_by_admin_user_id) VALUES($1,$2,$3,$4,$5,$6,$6) RETURNING id`,[targetId,day.day_date,day.title,day.summary,day.position,input.actor.adminUserId]);
      await client.query(`INSERT INTO plan_items(plan_day_id,title,description,item_type,start_time,end_time,location_text,source_url,local_guide_entry_id,status,position,reservation_note,visibility,created_by_admin_user_id,updated_by_admin_user_id)
        SELECT $1,title,description,item_type,start_time,end_time,location_text,source_url,local_guide_entry_id,status,position,reservation_note,visibility,$2,$2 FROM plan_items WHERE plan_day_id=$3 ORDER BY position`,[newDay.rows[0].id,input.actor.adminUserId,day.id]);
    }
    await recordRevision(client,targetId,1,input.actor,'plan_duplicated',`Duplicated example plan “${original.title}”.`,{sourcePlanId:input.planId});
    await client.query('COMMIT');
    const plan=await getHolidayPlan(created.rows[0].public_id,database);
    if(!plan) throw new PlannerError('NOT_FOUND','Duplicated plan could not be read.');
    return plan;
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}

type MutationContext = { client: PoolClient; internalId: string; revision: number };

async function mutatePlan<T>(
  database: Database,
  planId: string,
  expectedRevision: number,
  actor: PlannerRevisionActor,
  mutation: (context: MutationContext) => Promise<{ value: T; action: string; summary: string; changes: Record<string, unknown> }>,
): Promise<{ value: T; revision: number }> {
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    const plan = await lockPlan(client, planId, expectedRevision, actor);
    const result = await mutation({ client, internalId: plan.internalId, revision: plan.revision });
    const revision = await finishMutation(client, plan.internalId, plan.revision, actor, result.action, result.summary, result.changes);
    await client.query('COMMIT');
    return { value: result.value, revision };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function addPlanCandidateActivity(input: {
  planId: string; expectedRevision: number; title?: string; description?: string;
  sourceUrl?: string | null; localGuideEntryId?: string | null; actor: PlannerRevisionActor;
}, database: Database = getPool()): Promise<{ candidateId: string; revision: number }> {
  const result = await mutatePlan(database, input.planId, input.expectedRevision, input.actor, async ({ client, internalId }) => {
    const guide = await selectableGuideReference(client, input.localGuideEntryId);
    let title: string; let description: string; let sourceUrl: string | null;
    if (guide) {
      const published = await client.query<{ title: string; summary: string; external_link: string | null }>(
        `SELECT r.title, r.summary, r.external_link FROM local_guide_entries e
          JOIN local_guide_revisions r ON r.id=e.published_revision_id
         WHERE e.id=$1 AND e.status='published'`, [guide.internalId]);
      if (!published.rowCount) throw new PlannerError('VALIDATION_ERROR', 'The selected Local Guide entry is unavailable.');
      title = published.rows[0].title; description = published.rows[0].summary;
      sourceUrl = validateSourceUrl(published.rows[0].external_link);
    } else {
      title = requireText(input.title ?? '', 'Activity title', 200);
      description = input.description?.trim() ?? '';
      if (description.length > 10000) throw new PlannerError('VALIDATION_ERROR', 'Activity description is too long.');
      sourceUrl = validateSourceUrl(input.sourceUrl, true);
    }
    const created = await client.query<{ public_id: string }>(
      `INSERT INTO plan_candidate_activities
         (holiday_plan_id,title,description,source_url,local_guide_entry_id,position,created_by_admin_user_id,updated_by_admin_user_id)
       VALUES($1,$2,$3,$4,$5,COALESCE((SELECT max(position)+10 FROM plan_candidate_activities WHERE holiday_plan_id=$1),10),$6,$6)
       RETURNING public_id::text`, [internalId,title,description,sourceUrl,guide?.internalId??null,actorAdminUserId(input.actor)]);
    return { value: created.rows[0].public_id, action: 'candidate_activity_added',
      summary: `Added candidate activity “${title}”.`, changes: { candidateId: created.rows[0].public_id, localGuideEntryId: input.localGuideEntryId ?? null } };
  });
  return { candidateId: result.value, revision: result.revision };
}

export async function addPlanGuideCandidates(input: {
  planId: string;
  expectedRevision: number;
  localGuideEntryIds: string[];
  actor: PlannerRevisionActor;
}, database: Database = getPool()): Promise<{ addedCount: number; revision: number }> {
  const guideIds = [...new Set(input.localGuideEntryIds.map((id) =>
    validatePublicId(id, 'Local Guide entry identifier')))];
  if (!guideIds.length || guideIds.length > 100) {
    throw new PlannerError('VALIDATION_ERROR', 'The selected Local Guide category is unavailable.');
  }
  const result = await mutatePlan(database, input.planId, input.expectedRevision, input.actor,
    async ({ client, internalId }) => {
      const published = await client.query<{
        id: string; public_id: string; title: string; summary: string; external_link: string | null;
      }>(`SELECT e.id::text,e.public_id::text,r.title,r.summary,r.external_link
        FROM local_guide_entries e JOIN local_guide_revisions r ON r.id=e.published_revision_id
        WHERE e.public_id=ANY($1::uuid[]) AND e.status='published'`, [guideIds]);
      const byPublicId = new Map(published.rows.map((row) => [row.public_id, row]));
      const existing = await client.query<{ local_guide_entry_id: string }>(`SELECT local_guide_entry_id::text FROM plan_candidate_activities
        WHERE holiday_plan_id=$1 AND local_guide_entry_id IS NOT NULL
        UNION SELECT i.local_guide_entry_id::text FROM plan_items i JOIN plan_days d ON d.id=i.plan_day_id
        WHERE d.holiday_plan_id=$1 AND i.local_guide_entry_id IS NOT NULL`, [internalId]);
      const existingIds = new Set(existing.rows.map((row) => row.local_guide_entry_id));
      const lastPosition = await client.query<{ position: number }>(
        'SELECT COALESCE(max(position),0)::int position FROM plan_candidate_activities WHERE holiday_plan_id=$1',
        [internalId],
      );
      let position = Number(lastPosition.rows[0].position);
      const added: string[] = [];
      for (const guideId of guideIds) {
        const guide = byPublicId.get(guideId);
        if (!guide || existingIds.has(guide.id)) continue;
        position += 10;
        await client.query(
          `INSERT INTO plan_candidate_activities
            (holiday_plan_id,title,description,source_url,local_guide_entry_id,position,created_by_admin_user_id,updated_by_admin_user_id)
           VALUES($1,$2,$3,$4,$5,$6,$7,$7)`,
          [internalId, guide.title, guide.summary, validateSourceUrl(guide.external_link), guide.id, position,
            actorAdminUserId(input.actor)],
        );
        added.push(guideId);
      }
      if (!added.length) {
        throw new PlannerError('VALIDATION_ERROR', 'Every activity in this category is already in your candidates or plan.');
      }
      return {
        value: added.length,
        action: 'guide_category_candidates_added',
        summary: `Added ${added.length} Local Guide activities to candidates.`,
        changes: { localGuideEntryIds: added, addedCount: added.length },
      };
    });
  return { addedCount: result.value, revision: result.revision };
}

export async function movePlanCandidateActivity(input: {
  planId: string; candidateId: string; expectedRevision: number; direction: 'up'|'down'; actor: PlannerRevisionActor;
}, database: Database = getPool()): Promise<number> {
  const result = await mutatePlan(database,input.planId,input.expectedRevision,input.actor,async({client,internalId})=>{
    const rows=await client.query<any>('SELECT id,public_id::text,position FROM plan_candidate_activities WHERE holiday_plan_id=$1 ORDER BY position FOR UPDATE',[internalId]);
    const index=rows.rows.findIndex((row:any)=>row.public_id===validatePublicId(input.candidateId,'Candidate activity identifier'));
    const target=rows.rows[input.direction==='up'?index-1:index+1]; const current=rows.rows[index];
    if(!current)throw new PlannerError('NOT_FOUND','Candidate activity not found.');
    if(!target)throw new PlannerError('VALIDATION_ERROR','Candidate activity cannot move further.');
    await client.query('UPDATE plan_candidate_activities SET position=2147483647 WHERE id=$1',[current.id]);
    await client.query('UPDATE plan_candidate_activities SET position=$2 WHERE id=$1',[target.id,current.position]);
    await client.query('UPDATE plan_candidate_activities SET position=$2,updated_at=NOW() WHERE id=$1',[current.id,target.position]);
    return{value:undefined,action:'candidate_activity_reordered',summary:'Reordered candidate activities.',changes:{candidateId:input.candidateId,direction:input.direction}};
  });return result.revision;
}

export async function removePlanCandidateActivity(input:{
  planId:string;candidateId:string;expectedRevision:number;actor:PlannerRevisionActor;
},database:Database=getPool()):Promise<number>{
  const result=await mutatePlan(database,input.planId,input.expectedRevision,input.actor,async({client,internalId})=>{
    const removed=await client.query<{title:string}>(
      'DELETE FROM plan_candidate_activities WHERE public_id=$1::uuid AND holiday_plan_id=$2 RETURNING title',
      [validatePublicId(input.candidateId,'Candidate activity identifier'),internalId],
    );
    if(!removed.rowCount)throw new PlannerError('NOT_FOUND','Candidate activity not found.');
    return{value:undefined,action:'candidate_activity_removed',summary:`Removed candidate activity “${removed.rows[0].title}”.`,changes:{candidateId:input.candidateId}};
  });
  return result.revision;
}

export async function schedulePlanCandidateActivity(input:{
  planId:string;candidateId:string;dayId:string;expectedRevision:number;actor:PlannerRevisionActor;
},database:Database=getPool()):Promise<{itemId:string;revision:number}>{
  const result=await mutatePlan(database,input.planId,input.expectedRevision,input.actor,async({client,internalId})=>{
    const candidate=await client.query<any>('SELECT * FROM plan_candidate_activities WHERE public_id=$1::uuid AND holiday_plan_id=$2 FOR UPDATE',[validatePublicId(input.candidateId,'Candidate activity identifier'),internalId]);
    const day=await client.query<{id:string|number}>('SELECT id FROM plan_days WHERE public_id=$1::uuid AND holiday_plan_id=$2',[validatePublicId(input.dayId,'Plan day identifier'),internalId]);
    if(!candidate.rowCount||!day.rowCount)throw new PlannerError('NOT_FOUND','Candidate activity or plan day not found.');
    const row=candidate.rows[0];const created=await client.query<{public_id:string}>(`INSERT INTO plan_items(plan_day_id,title,description,item_type,source_url,local_guide_entry_id,status,position,visibility,created_by_admin_user_id,updated_by_admin_user_id)
      VALUES($1,$2,$3,'activity',$4,$5,'idea',COALESCE((SELECT max(position)+10 FROM plan_items WHERE plan_day_id=$1),10),'participants',$6,$6) RETURNING public_id::text`,[day.rows[0].id,row.title,row.description,row.source_url,row.local_guide_entry_id,actorAdminUserId(input.actor)]);
    await client.query('DELETE FROM plan_candidate_activities WHERE id=$1',[row.id]);
    return{value:created.rows[0].public_id,action:'candidate_activity_scheduled',summary:`Scheduled “${row.title}”.`,changes:{candidateId:input.candidateId,itemId:created.rows[0].public_id,dayId:input.dayId}};
  });return{itemId:result.value,revision:result.revision};
}

export async function returnPlanItemToCandidates(input:{planId:string;itemId:string;expectedRevision:number;actor:PlannerRevisionActor},database:Database=getPool()):Promise<{candidateId:string;revision:number}>{
  const result=await mutatePlan(database,input.planId,input.expectedRevision,input.actor,async({client,internalId})=>{
    const item=await client.query<any>(`SELECT i.* FROM plan_items i JOIN plan_days d ON d.id=i.plan_day_id WHERE i.public_id=$1::uuid AND d.holiday_plan_id=$2 FOR UPDATE OF i`,[validatePublicId(input.itemId,'Plan item identifier'),internalId]);
    if(!item.rowCount)throw new PlannerError('NOT_FOUND','Plan item not found.');const row=item.rows[0];
    const created=await client.query<{public_id:string}>(`INSERT INTO plan_candidate_activities(holiday_plan_id,title,description,source_url,local_guide_entry_id,position,created_by_admin_user_id,updated_by_admin_user_id)
      VALUES($1,$2,$3,$4,$5,COALESCE((SELECT max(position)+10 FROM plan_candidate_activities WHERE holiday_plan_id=$1),10),$6,$6) RETURNING public_id::text`,[internalId,row.title,row.description,row.source_url,row.local_guide_entry_id,actorAdminUserId(input.actor)]);
    await client.query('DELETE FROM plan_items WHERE id=$1',[row.id]);
    return{value:created.rows[0].public_id,action:'plan_item_returned_to_candidates',summary:`Returned “${row.title}” to candidate activities.`,changes:{itemId:input.itemId,candidateId:created.rows[0].public_id}};
  });return{candidateId:result.value,revision:result.revision};
}

export async function listPlanParticipants(
  planId: string,
  bookingId: string,
  database: Pick<Pool, 'query'> = getPool(),
): Promise<PlanParticipant[]> {
  const result = await database.query<any>(
    `SELECT pp.public_id::text, pp.display_name, pp.invited_email, pp.role,
            pp.accepted_at, pp.revoked_at
       FROM plan_participants pp
       JOIN holiday_plans hp ON hp.id = pp.holiday_plan_id
      WHERE hp.public_id = $1::uuid AND hp.booking_id = $2
      ORDER BY (pp.role = 'owner') DESC, pp.created_at`,
    [validatePublicId(planId, 'Plan identifier'), bookingId],
  );
  return result.rows.map((row: any) => ({
    id: row.public_id,
    displayName: row.display_name,
    email: row.invited_email,
    role: row.role,
    acceptedAt: row.accepted_at ? iso(row.accepted_at) : null,
    revokedAt: row.revoked_at ? iso(row.revoked_at) : null,
  }));
}

export async function invitePlanParticipant(input: {
  planId: string;
  expectedRevision: number;
  displayName: string;
  email: string;
  role: 'editor' | 'contributor' | 'viewer';
  actor: BookerPlanActor;
}, database: Database = getPool()): Promise<{ participantId: string; token: string; revision: number }> {
  const displayName = requireText(input.displayName, 'Participant name', 160);
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new PlannerError('VALIDATION_ERROR', 'Participant email address is invalid.');
  }
  if (!['editor', 'contributor', 'viewer'].includes(input.role)) {
    throw new PlannerError('VALIDATION_ERROR', 'Participant role is invalid.');
  }
  const credential = createParticipantCredential();
  try {
    const result = await mutatePlan(database, input.planId, input.expectedRevision, input.actor, async ({ client, internalId }) => {
      const owner = await client.query<{ id: string | number }>(
        `SELECT id FROM plan_participants
          WHERE holiday_plan_id = $1 AND booking_id = $2 AND role = 'owner' AND revoked_at IS NULL`,
        [internalId, input.actor.bookingId],
      );
      if (!owner.rowCount) throw new PlannerError('NOT_FOUND', 'Holiday plan not found.');
      const created = await client.query<{ public_id: string }>(
        `INSERT INTO plan_participants
           (holiday_plan_id, role, participant_type, booking_id, display_name,
            invited_email, access_token_hash, invited_by_participant_id)
         VALUES ($1, $2, 'guest', $3, $4, $5, $6, $7)
         RETURNING public_id::text`,
        [internalId, input.role, input.actor.bookingId, displayName, email, credential.hash, owner.rows[0].id],
      );
      return {
        value: { participantId: created.rows[0].public_id },
        action: 'participant_invited',
        summary: `Invited ${displayName} as ${input.role}.`,
        changes: { participantId: created.rows[0].public_id, displayName, role: input.role },
      };
    });
    return { ...result.value, token: credential.token, revision: result.revision };
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new PlannerError('VALIDATION_ERROR', 'That email address already has an active invitation.');
    }
    throw error;
  }
}

export async function changePlanParticipantRole(input: {
  planId: string;
  participantId: string;
  expectedRevision: number;
  role: 'editor' | 'contributor' | 'viewer';
  actor: BookerPlanActor;
}, database: Database = getPool()): Promise<number> {
  if (!['editor', 'contributor', 'viewer'].includes(input.role)) throw new PlannerError('VALIDATION_ERROR', 'Participant role is invalid.');
  const result = await mutatePlan(database, input.planId, input.expectedRevision, input.actor, async ({ client, internalId }) => {
    const updated = await client.query<{ display_name: string }>(
      `UPDATE plan_participants SET role = $3
        WHERE public_id = $1::uuid AND holiday_plan_id = $2
          AND participant_type = 'guest' AND role <> 'owner' AND revoked_at IS NULL
        RETURNING display_name`,
      [validatePublicId(input.participantId, 'Participant identifier'), internalId, input.role],
    );
    if (!updated.rowCount) throw new PlannerError('NOT_FOUND', 'Participant not found.');
    return { value: undefined, action: 'participant_role_changed', summary: `Changed ${updated.rows[0].display_name} to ${input.role}.`, changes: { participantId: input.participantId, role: input.role } };
  });
  return result.revision;
}

export async function revokePlanParticipant(input: {
  planId: string;
  participantId: string;
  expectedRevision: number;
  actor: BookerPlanActor;
}, database: Database = getPool()): Promise<number> {
  const result = await mutatePlan(database, input.planId, input.expectedRevision, input.actor, async ({ client, internalId }) => {
    const revoked = await client.query<{ display_name: string }>(
      `UPDATE plan_participants
          SET revoked_at = NOW(), access_token_hash = NULL
        WHERE public_id = $1::uuid AND holiday_plan_id = $2
          AND participant_type = 'guest' AND role <> 'owner' AND revoked_at IS NULL
        RETURNING display_name`,
      [validatePublicId(input.participantId, 'Participant identifier'), internalId],
    );
    if (!revoked.rowCount) throw new PlannerError('NOT_FOUND', 'Participant not found.');
    return { value: undefined, action: 'participant_revoked', summary: `Revoked ${revoked.rows[0].display_name}'s planner access.`, changes: { participantId: input.participantId } };
  });
  return result.revision;
}

export async function listPlanShareLinks(planId:string,bookingId:string,database:Pick<Pool,'query'>=getPool()):Promise<PlanShareLink[]>{
  const result=await database.query<any>(`SELECT s.public_id::text,s.expires_at,s.revoked_at,s.last_accessed_at,s.created_at
    FROM plan_share_links s JOIN holiday_plans hp ON hp.id=s.holiday_plan_id
    WHERE hp.public_id=$1::uuid AND hp.booking_id=$2 ORDER BY s.created_at DESC`,[validatePublicId(planId,'Plan identifier'),bookingId]);
  return result.rows.map((row:any)=>({id:row.public_id,expiresAt:iso(row.expires_at),revokedAt:row.revoked_at?iso(row.revoked_at):null,lastAccessedAt:row.last_accessed_at?iso(row.last_accessed_at):null,createdAt:iso(row.created_at)}));
}

export async function createPlanShareLink(input:{planId:string;expectedRevision:number;expiresDays:number;actor:BookerPlanActor},database:Database=getPool()):Promise<{shareId:string;token:string;expiresAt:string;revision:number}>{
  if(!Number.isInteger(input.expiresDays)||input.expiresDays<1||input.expiresDays>30)throw new PlannerError('VALIDATION_ERROR','Share expiry must be between 1 and 30 days.');
  const credential=createShareCredential();
  const result=await mutatePlan(database,input.planId,input.expectedRevision,input.actor,async({client,internalId})=>{
    const owner=await client.query<{id:string|number}>(`SELECT id FROM plan_participants WHERE holiday_plan_id=$1 AND booking_id=$2 AND role='owner' AND revoked_at IS NULL`,[internalId,input.actor.bookingId]);
    if(!owner.rowCount)throw new PlannerError('NOT_FOUND','Holiday plan not found.');
    const created=await client.query<{public_id:string;expires_at:Date|string}>(`INSERT INTO plan_share_links
      (holiday_plan_id,created_by_participant_id,token_hash,expires_at)
      VALUES($1,$2,$3,NOW()+($4*INTERVAL '1 day')) RETURNING public_id::text,expires_at`,[internalId,owner.rows[0].id,credential.hash,input.expiresDays]);
    return{value:{shareId:created.rows[0].public_id,expiresAt:iso(created.rows[0].expires_at)},action:'plan_share_created',summary:`Created a read-only share link for ${input.expiresDays} ${input.expiresDays===1?'day':'days'}.`,changes:{shareId:created.rows[0].public_id,expiresDays:input.expiresDays}};
  });
  return{...result.value,token:credential.token,revision:result.revision};
}

export async function revokePlanShareLink(input:{planId:string;shareId:string;expectedRevision:number;actor:BookerPlanActor},database:Database=getPool()):Promise<number>{
  const result=await mutatePlan(database,input.planId,input.expectedRevision,input.actor,async({client,internalId})=>{
    const revoked=await client.query(`UPDATE plan_share_links SET revoked_at=NOW(),token_hash=NULL WHERE public_id=$1::uuid AND holiday_plan_id=$2 AND revoked_at IS NULL`,[validatePublicId(input.shareId,'Share identifier'),internalId]);
    if(!revoked.rowCount)throw new PlannerError('NOT_FOUND','Active share link not found.');
    return{value:undefined,action:'plan_share_revoked',summary:'Revoked a read-only share link.',changes:{shareId:input.shareId}};
  });return result.revision;
}

type AiCapabilityActor = BookerPlanActor | Extract<PlannerRevisionActor, { type: 'participant' }>;

async function aiCapabilityCreator(client:PoolClient,planInternalId:string,actor:AiCapabilityActor):Promise<string>{
  if(actor.type==='participant'&&actor.role!=='editor')throw new PlannerError('NOT_FOUND','Holiday plan not found.');
  const result=actor.type==='booker'
    ? await client.query<{id:string|number}>(`SELECT id FROM plan_participants WHERE holiday_plan_id=$1 AND booking_id=$2 AND role='owner' AND revoked_at IS NULL`,[planInternalId,actor.bookingId])
    : await client.query<{id:string|number}>(`SELECT id FROM plan_participants WHERE id=$1 AND holiday_plan_id=$2 AND participant_type='guest' AND role='editor' AND revoked_at IS NULL`,[actor.participantId,planInternalId]);
  if(!result.rowCount)throw new PlannerError('NOT_FOUND','Holiday plan not found.');
  return String(result.rows[0].id);
}

export async function listPlanAiCapabilities(planId:string,actor:AiCapabilityActor,database:Pick<Pool,'query'>=getPool()):Promise<PlanAiCapability[]>{
  const actorClause=actor.type==='booker'
    ? `pp.booking_id=$2 AND pp.role='owner'`
    : `pp.id=$2 AND pp.role='editor' AND pp.participant_type='guest'`;
  if(actor.type==='participant'&&actor.role!=='editor')return[];
  const actorId=actor.type==='booker'?actor.bookingId:actor.participantId;
  const result=await database.query<any>(`SELECT c.public_id::text,c.protocol_version,c.scopes,c.created_plan_revision,c.expires_at,c.revoked_at,c.last_accessed_at,c.created_at
    FROM plan_ai_capabilities c JOIN holiday_plans hp ON hp.id=c.holiday_plan_id
    JOIN plan_participants pp ON pp.holiday_plan_id=hp.id
    WHERE hp.public_id=$1::uuid AND ${actorClause} AND pp.revoked_at IS NULL ORDER BY c.created_at DESC`,[validatePublicId(planId,'Plan identifier'),actorId]);
  return result.rows.map((row:any)=>({id:row.public_id,protocolVersion:row.protocol_version,scopes:row.scopes,createdPlanRevision:row.created_plan_revision,expiresAt:iso(row.expires_at),revokedAt:row.revoked_at?iso(row.revoked_at):null,lastAccessedAt:row.last_accessed_at?iso(row.last_accessed_at):null,createdAt:iso(row.created_at)}));
}

export async function createPlanAiCapability(input:{planId:string;expectedRevision:number;expiresHours:number;actor:AiCapabilityActor},database:Database=getPool()):Promise<{capabilityId:string;token:string;expiresAt:string;revision:number}>{
  if(!Number.isInteger(input.expiresHours)||input.expiresHours<1||input.expiresHours>24)throw new PlannerError('VALIDATION_ERROR','AI collaboration expiry must be between 1 and 24 hours.');
  const credential=createAiCapabilityCredential();
  const result=await mutatePlan(database,input.planId,input.expectedRevision,input.actor,async({client,internalId,revision})=>{
    const creatorId=await aiCapabilityCreator(client,internalId,input.actor);
    const created=await client.query<{public_id:string;expires_at:Date|string}>(`INSERT INTO plan_ai_capabilities
      (holiday_plan_id,created_by_participant_id,token_hash,protocol_version,created_plan_revision,expires_at)
      VALUES($1,$2,$3,$4,$5,NOW()+($6*INTERVAL '1 hour')) RETURNING public_id::text,expires_at`,[internalId,creatorId,credential.hash,AI_PLAN_VERSION,revision,input.expiresHours]);
    return{value:{capabilityId:created.rows[0].public_id,expiresAt:iso(created.rows[0].expires_at)},action:'ai_capability_created',summary:`Created a temporary AI collaboration capability for ${input.expiresHours} ${input.expiresHours===1?'hour':'hours'}.`,changes:{capabilityId:created.rows[0].public_id,expiresHours:input.expiresHours,protocolVersion:AI_PLAN_VERSION,scopes:['plan:read','proposal:submit']}};
  });
  return{...result.value,token:credential.token,revision:result.revision};
}

export async function revokePlanAiCapability(input:{planId:string;capabilityId:string;expectedRevision:number;actor:AiCapabilityActor},database:Database=getPool()):Promise<number>{
  const result=await mutatePlan(database,input.planId,input.expectedRevision,input.actor,async({client,internalId})=>{
    await aiCapabilityCreator(client,internalId,input.actor);
    const revoked=await client.query(`UPDATE plan_ai_capabilities SET revoked_at=NOW(),token_hash=NULL WHERE public_id=$1::uuid AND holiday_plan_id=$2 AND revoked_at IS NULL`,[validatePublicId(input.capabilityId,'AI capability identifier'),internalId]);
    if(!revoked.rowCount)throw new PlannerError('NOT_FOUND','Active AI collaboration capability not found.');
    return{value:undefined,action:'ai_capability_revoked',summary:'Revoked a temporary AI collaboration capability.',changes:{capabilityId:input.capabilityId}};
  });return result.revision;
}

const GUIDE_CONTRIBUTION_CONSENT_VERSION = 'local-guide-contribution-v1';
const GUIDE_CONTRIBUTION_CONSENT_STATEMENT = 'Share this specific recommendation with Olrig Bank so it may help future guests.';

async function contributionSubmitter(
  client: PoolClient,
  planInternalId: string,
  actor: BookerPlanActor | Extract<PlannerRevisionActor, { type: 'participant' }>,
): Promise<{ id: string; displayName: string }> {
  const result = actor.type === 'booker'
    ? await client.query<any>(
        `SELECT id::text, display_name FROM plan_participants
          WHERE holiday_plan_id = $1 AND booking_id = $2 AND role = 'owner' AND revoked_at IS NULL`,
        [planInternalId, actor.bookingId],
      )
    : await client.query<any>(
        `SELECT id::text, display_name FROM plan_participants
          WHERE id = $1 AND holiday_plan_id = $2 AND participant_type = 'guest' AND revoked_at IS NULL`,
        [actor.participantId, planInternalId],
      );
  if (!result.rowCount) throw new PlannerError('NOT_FOUND', 'Holiday plan not found.');
  return { id: result.rows[0].id, displayName: result.rows[0].display_name };
}

export async function offerGuideContribution(input: {
  planId: string;
  itemId: string;
  expectedRevision: number;
  offeredTitle: string;
  offeredDescription?: string;
  offeredLocationText?: string | null;
  consent: boolean;
  attributionPermitted: boolean;
  actor: BookerPlanActor | Extract<PlannerRevisionActor, { type: 'participant' }>;
}, database: Database = getPool()): Promise<{ candidateId: string; revision: number }> {
  if (input.consent !== true) throw new PlannerError('VALIDATION_ERROR', 'Explicit contribution consent is required.');
  const offeredTitle = requireText(input.offeredTitle, 'Contribution title', 200);
  const offeredDescription = input.offeredDescription?.trim() ?? '';
  if (offeredDescription.length > 5000) throw new PlannerError('VALIDATION_ERROR', 'Contribution description is too long.');
  const offeredLocationText = optionalText(input.offeredLocationText, 'Contribution location', 500);
  try {
    const result = await mutatePlan(database, input.planId, input.expectedRevision, input.actor, async ({ client, internalId }) => {
      const submitter = await contributionSubmitter(client, internalId, input.actor);
      const item = await client.query<{ id: string | number; title: string }>(
        `SELECT i.id, i.title FROM plan_items i
          JOIN plan_days d ON d.id = i.plan_day_id
         WHERE i.public_id = $1::uuid AND d.holiday_plan_id = $2 AND i.local_guide_entry_id IS NULL
           AND EXISTS (
             SELECT 1 FROM plan_revisions r
              WHERE r.holiday_plan_id = $2 AND r.action = 'item_added'
                AND r.changes->>'itemId' = i.public_id::text
                AND (($4 = 'participant' AND r.participant_id = $3)
                  OR ($4 = 'booker' AND r.actor_type = 'guest' AND r.participant_id IS NULL))
           )`,
        [validatePublicId(input.itemId, 'Plan item identifier'), internalId, submitter.id, input.actor.type],
      );
      if (!item.rowCount) throw new PlannerError('VALIDATION_ERROR', 'Only a custom activity you added can be offered.');
      const created = await client.query<{ public_id: string }>(
        `INSERT INTO guide_contribution_candidates
           (holiday_plan_id, plan_item_id, submitted_by_participant_id, offered_title,
            offered_description, offered_location_text, consent_version, consent_statement,
            attribution_permitted, attribution_name)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING public_id::text`,
        [internalId, item.rows[0].id, submitter.id, offeredTitle, offeredDescription,
          offeredLocationText, GUIDE_CONTRIBUTION_CONSENT_VERSION, GUIDE_CONTRIBUTION_CONSENT_STATEMENT, input.attributionPermitted,
          input.attributionPermitted ? submitter.displayName : null],
      );
      return {
        value: created.rows[0].public_id,
        action: 'guide_contribution_offered',
        summary: `Offered “${offeredTitle}” to the Local Guide.`,
        changes: { candidateId: created.rows[0].public_id, itemId: input.itemId, attributionPermitted: input.attributionPermitted },
      };
    });
    return { candidateId: result.value, revision: result.revision };
  } catch (error) {
    if ((error as { code?: string }).code === '23505') throw new PlannerError('VALIDATION_ERROR', 'This activity already has an active contribution.');
    throw error;
  }
}

export async function withdrawGuideContribution(input: {
  planId: string;
  candidateId: string;
  expectedRevision: number;
  actor: BookerPlanActor | Extract<PlannerRevisionActor, { type: 'participant' }>;
}, database: Database = getPool()): Promise<number> {
  const result = await mutatePlan(database, input.planId, input.expectedRevision, input.actor, async ({ client, internalId }) => {
    const submitter = await contributionSubmitter(client, internalId, input.actor);
    const withdrawn = await client.query<{ offered_title: string }>(
      `UPDATE guide_contribution_candidates SET status = 'withdrawn', withdrawn_at = NOW(), updated_at = NOW()
        WHERE public_id = $1::uuid AND holiday_plan_id = $2
          AND submitted_by_participant_id = $3 AND status = 'pending'
        RETURNING offered_title`,
      [validatePublicId(input.candidateId, 'Contribution identifier'), internalId, submitter.id],
    );
    if (!withdrawn.rowCount) throw new PlannerError('NOT_FOUND', 'Pending contribution not found.');
    return { value: undefined, action: 'guide_contribution_withdrawn', summary: `Withdrew “${withdrawn.rows[0].offered_title}” from Local Guide review.`, changes: { candidateId: input.candidateId } };
  });
  return result.revision;
}

export async function listGuideContributions(
  planId: string,
  database: Pick<Pool, 'query'> = getPool(),
): Promise<GuideContributionCandidate[]> {
  const result = await database.query<any>(
    `SELECT c.public_id::text, i.public_id::text AS item_id,
            c.submitted_by_participant_id::text, pp.display_name AS submitted_by_name,
            c.offered_title, c.offered_description, c.offered_location_text,
            c.attribution_permitted, c.attribution_name, c.status, c.consented_at, c.withdrawn_at
       FROM guide_contribution_candidates c
       JOIN holiday_plans hp ON hp.id = c.holiday_plan_id
       JOIN plan_participants pp ON pp.id = c.submitted_by_participant_id
       LEFT JOIN plan_items i ON i.id = c.plan_item_id
      WHERE hp.public_id = $1::uuid ORDER BY c.created_at DESC`,
    [validatePublicId(planId, 'Plan identifier')],
  );
  return result.rows.map((row: any) => ({
    id: row.public_id, itemId: row.item_id, submittedByParticipantId: row.submitted_by_participant_id,
    submittedByName: row.submitted_by_name, offeredTitle: row.offered_title,
    offeredDescription: row.offered_description, offeredLocationText: row.offered_location_text,
    attributionPermitted: row.attribution_permitted, attributionName: row.attribution_name,
    status: row.status, consentedAt: iso(row.consented_at), withdrawnAt: row.withdrawn_at ? iso(row.withdrawn_at) : null,
  }));
}

export async function listGuideContributionModerationQueue(
  database: Pick<Pool, 'query'> = getPool(),
): Promise<GuideContributionModerationCandidate[]> {
  const result = await database.query<any>(
    `SELECT c.public_id::text, i.public_id::text AS item_id,
            c.submitted_by_participant_id::text, pp.display_name AS submitted_by_name,
            c.offered_title, c.offered_description, c.offered_location_text,
            c.consent_version, c.consent_statement, c.attribution_permitted, c.attribution_name,
            c.status, c.consented_at, c.withdrawn_at, c.reviewed_title, c.reviewed_description,
            c.reviewed_location_text, c.reviewed_category_id, c.result_type, c.result_guide_slug, c.moderation_notes,
            result_entry.public_id::text AS result_entry_id, c.result_local_guide_revision_id::text,
            au.display_name AS reviewed_by_name, c.reviewed_at
       FROM guide_contribution_candidates c
       JOIN plan_participants pp ON pp.id = c.submitted_by_participant_id
       LEFT JOIN plan_items i ON i.id = c.plan_item_id
      LEFT JOIN admin_users au ON au.id = c.reviewed_by_admin_user_id
      LEFT JOIN local_guide_entries result_entry ON result_entry.id=c.result_local_guide_entry_id
      ORDER BY (c.status = 'pending') DESC, c.created_at DESC`,
  );
  return result.rows.map((row: any) => ({
    id: row.public_id, itemId: row.item_id, submittedByParticipantId: row.submitted_by_participant_id,
    submittedByName: row.submitted_by_name, offeredTitle: row.offered_title,
    offeredDescription: row.offered_description, offeredLocationText: row.offered_location_text,
    attributionPermitted: row.attribution_permitted, attributionName: row.attribution_name,
    status: row.status, consentedAt: iso(row.consented_at), withdrawnAt: row.withdrawn_at ? iso(row.withdrawn_at) : null,
    consentVersion: row.consent_version, consentStatement: row.consent_statement,
    reviewedTitle: row.reviewed_title, reviewedDescription: row.reviewed_description,
    reviewedLocationText: row.reviewed_location_text, resultType: row.result_type,
    resultGuideSlug: row.result_guide_slug, moderationNotes: row.moderation_notes,
    reviewedCategoryId:row.reviewed_category_id,resultLocalGuideEntryId:row.result_entry_id,
    resultLocalGuideRevisionId:row.result_local_guide_revision_id,
    reviewedByName: row.reviewed_by_name, reviewedAt: row.reviewed_at ? iso(row.reviewed_at) : null,
  }));
}

export async function moderateGuideContribution(input: {
  candidateId: string;
  decision: 'accept' | 'reject';
  reviewedTitle?: string;
  reviewedDescription?: string;
  reviewedLocationText?: string | null;
  resultType?: 'new_entry_draft' | 'suggested_update';
  resultGuideSlug?: string;
  reviewedCategoryId?: string;
  moderationNotes?: string;
  actor: PlanActor;
}, database: Database = getPool()): Promise<{ revision: number; planId: string }> {
  const notes = optionalText(input.moderationNotes, 'Moderation notes', 3000);
  if (input.decision === 'reject' && !notes) throw new PlannerError('VALIDATION_ERROR', 'A rejection reason is required.');
  const reviewedTitle = input.decision === 'accept' ? requireText(input.reviewedTitle ?? '', 'Reviewed title', 200) : null;
  const reviewedDescription = input.decision === 'accept' ? (input.reviewedDescription?.trim() ?? '') : null;
  if (reviewedDescription !== null && reviewedDescription.length > 5000) throw new PlannerError('VALIDATION_ERROR', 'Reviewed description is too long.');
  const reviewedLocationText = input.decision === 'accept' ? optionalText(input.reviewedLocationText, 'Reviewed location', 500) : null;
  const resultType = input.decision === 'accept' && ['new_entry_draft', 'suggested_update'].includes(input.resultType ?? '') ? input.resultType! : null;
  const resultGuideSlug = input.decision === 'accept' ? validateGuideSlug(input.resultGuideSlug) : null;
  const reviewedCategoryId = input.decision === 'accept' && input.resultType === 'new_entry_draft'
    ? validateGuideSlug(input.reviewedCategoryId ?? 'activities') : null;
  if (input.decision === 'accept' && (!resultType || !resultGuideSlug)) throw new PlannerError('VALIDATION_ERROR', 'An accepted contribution needs a result type and Local Guide slug.');
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    const candidate = await client.query<any>(
      `SELECT c.*, hp.id AS plan_internal_id, hp.public_id::text AS plan_id, hp.revision
         FROM guide_contribution_candidates c
         JOIN holiday_plans hp ON hp.id = c.holiday_plan_id
        WHERE c.public_id = $1::uuid AND c.status = 'pending'
        FOR UPDATE OF c, hp`,
      [validatePublicId(input.candidateId, 'Contribution identifier')],
    );
    if (!candidate.rowCount) throw new PlannerError('NOT_FOUND', 'Pending contribution not found.');
    const row = candidate.rows[0];
    let resultEntryId: string; let resultRevisionId: string;
    if (input.decision === 'accept' && resultType === 'new_entry_draft') {
      const created=await client.query<{id:string|number}>(`INSERT INTO local_guide_entries(canonical_slug,status,created_by_admin_user_id,updated_by_admin_user_id) VALUES($1,'draft',$2,$2) RETURNING id`,[resultGuideSlug,input.actor.adminUserId]);
      resultEntryId=String(created.rows[0].id);
      const revision=await client.query<{id:string|number}>(`INSERT INTO local_guide_revisions(local_guide_entry_id,revision_number,title,summary,markdown_body,category_id,actor_type,admin_user_id,source,action,change_summary)
        VALUES($1,1,$2,$3,$4,$5,'contribution',$6,'planner_contribution','contribution_accepted',$7::jsonb) RETURNING id`,[resultEntryId,reviewedTitle,reviewedDescription?.slice(0,1000)??'',reviewedDescription??'',reviewedCategoryId,input.actor.adminUserId,JSON.stringify({candidateId:input.candidateId,consentVersion:row.consent_version,consentedAt:row.consented_at,attributionPermitted:row.attribution_permitted,attributionName:row.attribution_name})]);
      resultRevisionId=String(revision.rows[0].id);
      await client.query(`UPDATE local_guide_entries SET working_revision_id=$2 WHERE id=$1`,[resultEntryId,resultRevisionId]);
    } else if (input.decision === 'accept') {
      const target=await client.query<any>(`SELECT e.*,r.* FROM local_guide_entries e JOIN local_guide_revisions r ON r.id=e.working_revision_id LEFT JOIN local_guide_slug_aliases a ON a.local_guide_entry_id=e.id WHERE lower(e.canonical_slug)=lower($1) OR lower(a.old_slug)=lower($1) FOR UPDATE OF e`,[resultGuideSlug]);
      if(!target.rowCount)throw new PlannerError('VALIDATION_ERROR','The Local Guide update target is unavailable.');
      const base=target.rows[0];resultEntryId=String(base.local_guide_entry_id??base.id);const next=base.lock_version+1;
      const revision=await client.query<{id:string|number}>(`INSERT INTO local_guide_revisions(local_guide_entry_id,revision_number,title,summary,markdown_body,category_id,category_label,image_path,external_link,recommended,legacy_text,actor_type,admin_user_id,source,action,change_summary)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'contribution',$12,'planner_contribution','contribution_accepted',$13::jsonb) RETURNING id`,[resultEntryId,next,reviewedTitle,reviewedDescription?.slice(0,1000)??'',reviewedDescription??'',base.category_id,base.category_label,base.image_path,base.external_link,base.recommended,base.legacy_text,input.actor.adminUserId,JSON.stringify({candidateId:input.candidateId,consentVersion:row.consent_version,consentedAt:row.consented_at,attributionPermitted:row.attribution_permitted,attributionName:row.attribution_name})]);
      resultRevisionId=String(revision.rows[0].id);await client.query(`UPDATE local_guide_entries SET working_revision_id=$2,lock_version=$3,updated_by_admin_user_id=$4,updated_at=NOW() WHERE id=$1`,[resultEntryId,resultRevisionId,next,input.actor.adminUserId]);
    }
    if(input.decision==='accept')await client.query(`INSERT INTO local_guide_events(local_guide_entry_id,revision_number,actor_type,admin_user_id,source,action,details) SELECT $1,r.revision_number,'contribution',$3,'planner_contribution','contribution_accepted',$4::jsonb FROM local_guide_revisions r WHERE r.id=$2`,[resultEntryId!,resultRevisionId!,input.actor.adminUserId,JSON.stringify({candidateId:input.candidateId,resultType})]);
    await client.query(
      `UPDATE guide_contribution_candidates
          SET status = $2, reviewed_title = $3, reviewed_description = $4,
              reviewed_location_text = $5, result_type = $6, result_guide_slug = $7,
              moderation_notes = $8, reviewed_by_admin_user_id = $9, reviewed_category_id=$10,
              result_local_guide_entry_id=$11,result_local_guide_revision_id=$12,
              reviewed_at = NOW(), updated_at = NOW()
        WHERE public_id = $1::uuid`,
      [input.candidateId, input.decision === 'accept' ? 'accepted' : 'rejected', reviewedTitle,
        reviewedDescription, reviewedLocationText, resultType, resultGuideSlug, notes, input.actor.adminUserId,reviewedCategoryId,resultEntryId!,resultRevisionId!],
    );
    const action = input.decision === 'accept' ? 'guide_contribution_accepted' : 'guide_contribution_rejected';
    const summary = input.decision === 'accept'
      ? `Accepted “${row.offered_title}” as a Local Guide ${resultType === 'new_entry_draft' ? 'entry draft' : 'suggested update'}.`
      : `Rejected “${row.offered_title}” for Local Guide use.`;
    const revision = await finishMutation(client, String(row.plan_internal_id), row.revision, input.actor, action, summary,
      { candidateId: input.candidateId, decision: input.decision, resultType, resultGuideSlug });
    await client.query('COMMIT');
    return { revision, planId: row.plan_id };
  } catch (error) {
    await client.query('ROLLBACK');
    if ((error as { code?: string }).code === '23505') throw new PlannerError('VALIDATION_ERROR', 'That new Local Guide slug already has an accepted draft.');
    throw error;
  } finally {
    client.release();
  }
}

export async function updateExamplePlan(
  input: {
    planId: string; expectedRevision: number; title: string; description?: string;
    startsOn?: string | null; endsOn?: string | null; durationDays?: number | null; actor: PlanActor;
  },
  database: Database = getPool(),
): Promise<number> {
  const title = requireText(input.title, 'Plan title', 160, 3);
  const description = input.description?.trim() ?? '';
  if (description.length > 5000) throw new PlannerError('VALIDATION_ERROR', 'Plan description is too long.');
  const startsOn = validateDate(input.startsOn, 'Plan start date');
  const endsOn = validateDate(input.endsOn, 'Plan end date');
  if ((startsOn === null) !== (endsOn === null)) throw new PlannerError('VALIDATION_ERROR', 'Plan start and end dates must be supplied together.');
  if (startsOn && endsOn && endsOn < startsOn) throw new PlannerError('VALIDATION_ERROR', 'Plan end date cannot precede its start date.');
  const durationDays = input.durationDays ?? null;
  if (durationDays != null && (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 366)) {
    throw new PlannerError('VALIDATION_ERROR', 'Plan duration must be between 1 and 366 days.');
  }
  const result = await mutatePlan(database, input.planId, input.expectedRevision, input.actor, async ({ client, internalId }) => {
    const incompatible = await client.query(
      startsOn
        ? `SELECT 1 FROM plan_days WHERE holiday_plan_id = $1 AND (day_date IS NULL OR day_date < $2::date OR day_date > $3::date) LIMIT 1`
        : `SELECT 1 FROM plan_days WHERE holiday_plan_id = $1 AND day_date IS NOT NULL LIMIT 1`,
      startsOn ? [internalId, startsOn, endsOn] : [internalId],
    );
    if (incompatible.rowCount) throw new PlannerError('VALIDATION_ERROR', 'Existing days do not fit the selected plan dates.');
    const updated = await client.query(
      `UPDATE holiday_plans SET title = $2, description = $3, starts_on = $4::date,
         ends_on = $5::date, duration_days = $6 WHERE id = $1 AND plan_type = 'example' AND archived_at IS NULL`,
      [internalId, title, description, startsOn, endsOn, durationDays],
    );
    if (!updated.rowCount) throw new PlannerError('NOT_FOUND', 'Editable example plan not found.');
    return { value: undefined, action: 'plan_updated', summary: `Updated example plan “${title}”.`, changes: { title, startsOn, endsOn, durationDays } };
  });
  return result.revision;
}

export async function updateBookingLinkedPlan(
  input: { planId: string; expectedRevision: number; title: string; description?: string; actor: PlannerRevisionActor },
  database: Database = getPool(),
): Promise<number> {
  const title = requireText(input.title, 'Plan title', 160, 3);
  const description = input.description?.trim() ?? '';
  if (description.length > 5000) throw new PlannerError('VALIDATION_ERROR', 'Plan description is too long.');
  const result = await mutatePlan(database, input.planId, input.expectedRevision, input.actor, async ({ client, internalId }) => {
    const updated = await client.query(
      `UPDATE holiday_plans SET title = $2, description = $3
        WHERE id = $1 AND plan_type = 'booking_linked' AND archived_at IS NULL`,
      [internalId, title, description],
    );
    if (!updated.rowCount) throw new PlannerError('NOT_FOUND', 'Booking holiday plan not found.');
    return { value: undefined, action: 'booking_plan_updated', summary: `Updated holiday plan “${title}”.`, changes: { title } };
  });
  return result.revision;
}

export async function archiveExamplePlan(
  input: { planId: string; expectedRevision: number; actor: PlanActor },
  database: Database = getPool(),
): Promise<number> {
  const result = await mutatePlan(database, input.planId, input.expectedRevision, input.actor, async ({ client, internalId }) => {
    const updated = await client.query(
      `UPDATE holiday_plans SET archived_at = NOW(), publication_status = 'unpublished', visibility = 'private'
        WHERE id = $1 AND plan_type = 'example' AND archived_at IS NULL`, [internalId],
    );
    if (!updated.rowCount) throw new PlannerError('NOT_FOUND', 'Editable example plan not found.');
    return { value: undefined, action: 'plan_archived', summary: 'Archived example plan.', changes: { archived: true } };
  });
  return result.revision;
}

function slugifyPlanTitle(title: string): string {
  const slug = title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 120).replace(/-$/g, '');
  return slug || 'holiday-plan';
}

async function availablePublicSlug(client: PoolClient, title: string): Promise<string> {
  await client.query("SELECT pg_advisory_xact_lock(hashtext('holiday-plan-public-slug'))");
  const base = slugifyPlanTitle(title);
  for (let suffix = 1; suffix < 10000; suffix += 1) {
    const candidate = suffix === 1 ? base : `${base.slice(0, 120 - String(suffix).length - 1)}-${suffix}`;
    const existing = await client.query('SELECT 1 FROM holiday_plans WHERE public_slug = $1', [candidate]);
    if (!existing.rowCount) return candidate;
  }
  throw new PlannerError('VALIDATION_ERROR', 'A public URL could not be allocated for this plan.');
}

export async function publishExamplePlan(
  input: { planId: string; expectedRevision: number; actor: PlanActor },
  database: Database = getPool(),
): Promise<{ revision: number; publicSlug: string }> {
  const result = await mutatePlan(database, input.planId, input.expectedRevision, input.actor, async ({ client, internalId }) => {
    const plan = await client.query<{ title: string; public_slug: string | null; publication_status: string }>(
      `SELECT title, public_slug, publication_status FROM holiday_plans
        WHERE id = $1 AND plan_type = 'example' AND archived_at IS NULL`, [internalId],
    );
    if (!plan.rowCount) throw new PlannerError('NOT_FOUND', 'Publishable example plan not found.');
    if (plan.rows[0].publication_status === 'published') throw new PlannerError('VALIDATION_ERROR', 'The example plan is already published.');
    const incomplete = await client.query(
      `SELECT 1
         FROM holiday_plans p
        WHERE p.id = $1
          AND (NOT EXISTS (SELECT 1 FROM plan_days d WHERE d.holiday_plan_id = p.id)
            OR EXISTS (
              SELECT 1 FROM plan_days d
               WHERE d.holiday_plan_id = p.id
                 AND NOT EXISTS (
                   SELECT 1 FROM plan_items i WHERE i.plan_day_id = d.id AND i.visibility <> 'private'
                 )
            ))`, [internalId],
    );
    if (incomplete.rowCount) throw new PlannerError('VALIDATION_ERROR', 'Add at least one item to every day before publishing.');
    const publicSlug = plan.rows[0].public_slug ?? await availablePublicSlug(client, plan.rows[0].title);
    await client.query(
      `UPDATE holiday_plans SET publication_status = 'published', visibility = 'public', public_slug = $2
        WHERE id = $1`, [internalId, publicSlug],
    );
    return { value: publicSlug, action: 'plan_published', summary: `Published example plan at /holiday-plans/${publicSlug}/.`, changes: { publicSlug } };
  });
  return { revision: result.revision, publicSlug: result.value };
}

export async function unpublishExamplePlan(
  input: { planId: string; expectedRevision: number; actor: PlanActor },
  database: Database = getPool(),
): Promise<number> {
  const result = await mutatePlan(database, input.planId, input.expectedRevision, input.actor, async ({ client, internalId }) => {
    const updated = await client.query<{ public_slug: string }>(
      `UPDATE holiday_plans SET publication_status = 'unpublished', visibility = 'private'
        WHERE id = $1 AND plan_type = 'example' AND archived_at IS NULL AND publication_status = 'published'
        RETURNING public_slug`, [internalId],
    );
    if (!updated.rowCount) throw new PlannerError('VALIDATION_ERROR', 'Only a published example plan can be unpublished.');
    return { value: undefined, action: 'plan_unpublished', summary: 'Unpublished example plan.', changes: { publicSlug: updated.rows[0].public_slug } };
  });
  return result.revision;
}

export async function getPublishedExamplePlanBySlug(
  slug: string,
  database: Pick<Pool, 'query'> = getPool(),
): Promise<HolidayPlan | null> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  const result = await database.query<{ public_id: string }>(
    `SELECT public_id::text FROM holiday_plans
      WHERE public_slug = $1 AND plan_type = 'example' AND publication_status = 'published'
        AND visibility = 'public' AND archived_at IS NULL`, [slug],
  );
  return result.rowCount ? getHolidayPlan(result.rows[0].public_id, database) : null;
}

export async function listPublishedExamplePlans(
  database: Pick<Pool, 'query'> = getPool(),
): Promise<HolidayPlanSummary[]> {
  const result = await database.query<any>(
    `SELECT p.*, count(d.id)::int AS day_count
       FROM holiday_plans p
       LEFT JOIN plan_days d ON d.holiday_plan_id = p.id
      WHERE p.plan_type = 'example' AND p.publication_status = 'published'
        AND p.visibility = 'public' AND p.archived_at IS NULL AND p.public_slug IS NOT NULL
      GROUP BY p.id ORDER BY p.updated_at DESC`,
  );
  return result.rows.map((row: any) => ({
    id: String(row.public_id), planType: row.plan_type, bookingId: null,
    title: row.title, description: row.description, publicationStatus: row.publication_status,
    visibility: row.visibility, publicSlug: row.public_slug,
    startsOn: date(row.starts_on), endsOn: date(row.ends_on), durationDays: row.duration_days,
    revision: row.revision, archivedAt: null, createdAt: iso(row.created_at), updatedAt: iso(row.updated_at),
    dayCount: row.day_count,
  }));
}

async function requireCompatibleDayDate(client: PoolClient, planInternalId: string, inputDate: string | null): Promise<void> {
  const plan = await client.query<{ starts_on: string | Date | null; ends_on: string | Date | null }>(
    'SELECT starts_on, ends_on FROM holiday_plans WHERE id = $1 AND archived_at IS NULL', [planInternalId],
  );
  if (!plan.rowCount) throw new PlannerError('NOT_FOUND', 'Editable example plan not found.');
  const startsOn = date(plan.rows[0].starts_on);
  const endsOn = date(plan.rows[0].ends_on);
  if (startsOn === null && inputDate !== null) throw new PlannerError('VALIDATION_ERROR', 'Relative plans cannot contain dated days.');
  if (startsOn !== null && inputDate === null) throw new PlannerError('VALIDATION_ERROR', 'Dated plans require a date for every day.');
  if (inputDate && (inputDate < startsOn! || inputDate > endsOn!)) throw new PlannerError('VALIDATION_ERROR', 'Plan day date must fall within the plan dates.');
}

export async function updatePlanDay(
  input: { planId: string; dayId: string; expectedRevision: number; title: string; summary?: string; date?: string | null; actor: PlannerRevisionActor },
  database: Database = getPool(),
): Promise<number> {
  const title = requireText(input.title, 'Day title', 160);
  const summary = input.summary?.trim() ?? '';
  if (summary.length > 3000) throw new PlannerError('VALIDATION_ERROR', 'Day summary is too long.');
  const dayDate = validateDate(input.date, 'Plan day date');
  const result = await mutatePlan(database, input.planId, input.expectedRevision, input.actor, async ({ client, internalId }) => {
    await requireCompatibleDayDate(client, internalId, dayDate);
    const updated = await client.query(
      `UPDATE plan_days SET title = $3, summary = $4, day_date = $5::date,
         updated_by_admin_user_id = $6, updated_at = NOW()
       WHERE public_id = $1::uuid AND holiday_plan_id = $2`,
      [validatePublicId(input.dayId, 'Plan day identifier'), internalId, title, summary, dayDate, actorAdminUserId(input.actor)],
    );
    if (!updated.rowCount) throw new PlannerError('NOT_FOUND', 'Plan day not found.');
    return { value: undefined, action: 'day_updated', summary: `Updated day “${title}”.`, changes: { dayId: input.dayId, title, date: dayDate } };
  });
  return result.revision;
}

export async function removePlanDay(
  input: { planId: string; dayId: string; expectedRevision: number; actor: PlannerRevisionActor },
  database: Database = getPool(),
): Promise<number> {
  const result = await mutatePlan(database, input.planId, input.expectedRevision, input.actor, async ({ client, internalId }) => {
    const removed = await client.query<{ title: string }>(
      'DELETE FROM plan_days WHERE public_id = $1::uuid AND holiday_plan_id = $2 RETURNING title',
      [validatePublicId(input.dayId, 'Plan day identifier'), internalId],
    );
    if (!removed.rowCount) throw new PlannerError('NOT_FOUND', 'Plan day not found.');
    return { value: undefined, action: 'day_removed', summary: `Removed day “${removed.rows[0].title}”.`, changes: { dayId: input.dayId } };
  });
  return result.revision;
}

export async function movePlanDay(
  input: { planId: string; dayId: string; expectedRevision: number; direction: 'up' | 'down'; actor: PlannerRevisionActor },
  database: Database = getPool(),
): Promise<number> {
  const result = await mutatePlan(database, input.planId, input.expectedRevision, input.actor, async ({ client, internalId }) => {
    const days = await client.query<{ id: string | number; public_id: string; position: number }>(
      'SELECT id, public_id::text, position FROM plan_days WHERE holiday_plan_id = $1 ORDER BY position FOR UPDATE', [internalId],
    );
    const index = days.rows.findIndex((row) => row.public_id === validatePublicId(input.dayId, 'Plan day identifier'));
    const targetIndex = input.direction === 'up' ? index - 1 : index + 1;
    if (index < 0) throw new PlannerError('NOT_FOUND', 'Plan day not found.');
    if (targetIndex < 0 || targetIndex >= days.rows.length) throw new PlannerError('VALIDATION_ERROR', 'Plan day cannot move further.');
    const current = days.rows[index];
    const target = days.rows[targetIndex];
    await client.query('UPDATE plan_days SET position = 2147483647 WHERE id = $1', [current.id]);
    await client.query('UPDATE plan_days SET position = $2, updated_at = NOW() WHERE id = $1', [target.id, current.position]);
    await client.query('UPDATE plan_days SET position = $2, updated_at = NOW() WHERE id = $1', [current.id, target.position]);
    return { value: undefined, action: 'day_reordered', summary: `Moved a plan day ${input.direction}.`, changes: { dayId: input.dayId, direction: input.direction } };
  });
  return result.revision;
}

type ItemInput = {
  title: string; description?: string; itemType: PlanItemType; startTime?: string | null;
  endTime?: string | null; locationText?: string | null; status?: PlanItemStatus;
  reservationNote?: string | null; visibility?: PlanItemVisibility; sourceUrl?: string | null;
};

function validatedItem(input: ItemInput) {
  const title = requireText(input.title, 'Item title', 200);
  const description = input.description?.trim() ?? '';
  if (description.length > 10000) throw new PlannerError('VALIDATION_ERROR', 'Item description is too long.');
  if (!PLAN_ITEM_TYPES.includes(input.itemType)) throw new PlannerError('VALIDATION_ERROR', 'Plan item type is invalid.');
  const status = input.status ?? 'idea';
  const visibility = input.visibility ?? 'participants';
  if (!PLAN_ITEM_STATUSES.includes(status)) throw new PlannerError('VALIDATION_ERROR', 'Plan item status is invalid.');
  if (!PLAN_ITEM_VISIBILITIES.includes(visibility)) throw new PlannerError('VALIDATION_ERROR', 'Plan item visibility is invalid.');
  const startTime = validateTime(input.startTime, 'Item start time');
  const endTime = validateTime(input.endTime, 'Item end time');
  if (startTime && endTime && endTime <= startTime) throw new PlannerError('VALIDATION_ERROR', 'Item end time must be after its start time.');
  return { title, description, itemType: input.itemType, startTime, endTime,
    locationText: optionalText(input.locationText, 'Location', 500), sourceUrl:validateSourceUrl(input.sourceUrl),status,
    reservationNote: optionalText(input.reservationNote, 'Reservation note', 3000), visibility };
}

async function orderDayItemsBySchedule(client: PoolClient, dayId: string | number): Promise<void> {
  const ordered = await client.query<{ id: string | number }>(
    `SELECT id FROM plan_items WHERE plan_day_id=$1
      ORDER BY start_time IS NULL, start_time NULLS LAST, position, id FOR UPDATE`, [dayId],
  );
  await client.query('UPDATE plan_items SET position=position+1000000 WHERE plan_day_id=$1', [dayId]);
  for (let index = 0; index < ordered.rows.length; index += 1) {
    await client.query('UPDATE plan_items SET position=$2 WHERE id=$1', [ordered.rows[index].id, (index + 1) * 10]);
  }
}

export async function updatePlanItem(input: ItemInput & {
  planId: string; itemId: string; expectedRevision: number; actor: PlannerRevisionActor;
}, database: Database = getPool()): Promise<number> {
  const item = validatedItem(input);
  const result = await mutatePlan(database, input.planId, input.expectedRevision, input.actor, async ({ client, internalId }) => {
    const existing = await client.query<{ status: PlanItemStatus; plan_day_id: string | number }>(
      `SELECT i.status,i.plan_day_id FROM plan_items i JOIN plan_days d ON d.id=i.plan_day_id
       WHERE i.public_id=$1::uuid AND d.holiday_plan_id=$2 FOR UPDATE`,
      [validatePublicId(input.itemId, 'Plan item identifier'), internalId]);
    if (!existing.rowCount) throw new PlannerError('NOT_FOUND', 'Plan item not found.');
    validateItemStatusTransition(existing.rows[0].status, item.status);
    await client.query(`UPDATE plan_items SET title=$2,description=$3,item_type=$4,start_time=$5::time,
      end_time=$6::time,location_text=$7,source_url=$8,status=$9,reservation_note=$10,visibility=$11,
      updated_by_admin_user_id=$12,updated_at=NOW() WHERE public_id=$1::uuid`,
      [input.itemId,item.title,item.description,item.itemType,item.startTime,item.endTime,item.locationText,item.sourceUrl,item.status,item.reservationNote,item.visibility,actorAdminUserId(input.actor)]);
    await orderDayItemsBySchedule(client, existing.rows[0].plan_day_id);
    return { value: undefined, action:'item_updated', summary:`Updated item “${item.title}”.`, changes:{itemId:input.itemId,status:item.status} };
  }); return result.revision;
}

export async function removePlanItem(input:{planId:string;itemId:string;expectedRevision:number;actor:PlannerRevisionActor}, database:Database=getPool()):Promise<number>{
  const result=await mutatePlan(database,input.planId,input.expectedRevision,input.actor,async({client,internalId})=>{
    const removed=await client.query<{title:string}>(`DELETE FROM plan_items i USING plan_days d WHERE i.plan_day_id=d.id AND i.public_id=$1::uuid AND d.holiday_plan_id=$2 RETURNING i.title`,[validatePublicId(input.itemId,'Plan item identifier'),internalId]);
    if(!removed.rowCount) throw new PlannerError('NOT_FOUND','Plan item not found.');
    return {value:undefined,action:'item_removed',summary:`Removed item “${removed.rows[0].title}”.`,changes:{itemId:input.itemId}};
  }); return result.revision;
}

export async function setPlanItemGuideReference(input:{planId:string;itemId:string;localGuideEntryId:string|null;expectedRevision:number;actor:PlannerRevisionActor},database:Database=getPool()):Promise<number>{
  const result=await mutatePlan(database,input.planId,input.expectedRevision,input.actor,async({client,internalId})=>{
    const guide=await selectableGuideReference(client,input.localGuideEntryId);
    const updated=await client.query(`UPDATE plan_items i SET local_guide_entry_id=$3,updated_by_admin_user_id=$4,updated_at=NOW() FROM plan_days d WHERE i.plan_day_id=d.id AND i.public_id=$1::uuid AND d.holiday_plan_id=$2`,[validatePublicId(input.itemId,'Plan item identifier'),internalId,guide?.internalId??null,actorAdminUserId(input.actor)]);
    if(!updated.rowCount) throw new PlannerError('NOT_FOUND','Plan item not found.');
    return {value:undefined,action:guide?'guide_reference_attached':'guide_reference_detached',summary:guide?`Linked plan item to Local Guide entry “${guide.slug}”.`:'Detached Local Guide reference.',changes:{itemId:input.itemId,localGuideEntryId:input.localGuideEntryId,localGuideSlug:guide?.slug??null}};
  });return result.revision;
}

export async function movePlanItem(input:{planId:string;itemId:string;targetDayId:string;expectedRevision:number;position:'up'|'down'|'end';actor:PlannerRevisionActor},database:Database=getPool()):Promise<number>{
  const result=await mutatePlan(database,input.planId,input.expectedRevision,input.actor,async({client,internalId})=>{
    const rows=await client.query<any>(`SELECT i.id,i.public_id::text,i.plan_day_id,i.position FROM plan_items i JOIN plan_days d ON d.id=i.plan_day_id WHERE d.holiday_plan_id=$1 ORDER BY i.plan_day_id,i.position FOR UPDATE OF i`,[internalId]);
    const current=rows.rows.find((r:any)=>r.public_id===validatePublicId(input.itemId,'Plan item identifier'));
    const targetDay=await client.query<{id:string|number}>('SELECT id FROM plan_days WHERE public_id=$1::uuid AND holiday_plan_id=$2',[validatePublicId(input.targetDayId,'Plan day identifier'),internalId]);
    if(!current||!targetDay.rowCount) throw new PlannerError('NOT_FOUND','Plan item or target day not found.');
    const siblings=rows.rows.filter((r:any)=>String(r.plan_day_id)===String(current.plan_day_id)); const index=siblings.findIndex((r:any)=>r.id===current.id);
    if(String(current.plan_day_id)===String(targetDay.rows[0].id)&&input.position!=='end'){
      const target=siblings[input.position==='up'?index-1:index+1]; if(!target) throw new PlannerError('VALIDATION_ERROR','Plan item cannot move further.');
      await client.query('UPDATE plan_items SET position=2147483647 WHERE id=$1',[current.id]); await client.query('UPDATE plan_items SET position=$2 WHERE id=$1',[target.id,current.position]); await client.query('UPDATE plan_items SET position=$2 WHERE id=$1',[current.id,target.position]);
    }else{
      const sourceDayId=current.plan_day_id;
      const next=await client.query<{position:number}>('SELECT COALESCE(max(position)+10,10)::int position FROM plan_items WHERE plan_day_id=$1',[targetDay.rows[0].id]);
      await client.query('UPDATE plan_items SET plan_day_id=$2,position=$3,updated_at=NOW() WHERE id=$1',[current.id,targetDay.rows[0].id,next.rows[0].position]);
      await orderDayItemsBySchedule(client,sourceDayId);
      await orderDayItemsBySchedule(client,targetDay.rows[0].id);
    }
    return {value:undefined,action:'item_moved',summary:'Moved a plan item.',changes:{itemId:input.itemId,targetDayId:input.targetDayId,position:input.position}};
  });return result.revision;
}

export async function placePlanItem(input:{planId:string;itemId:string;relativeItemId:string;placement:'before'|'after';expectedRevision:number;actor:PlannerRevisionActor},database:Database=getPool()):Promise<number>{
  const result=await mutatePlan(database,input.planId,input.expectedRevision,input.actor,async({client,internalId})=>{
    const rows=await client.query<any>(`SELECT i.id,i.public_id::text,i.plan_day_id FROM plan_items i JOIN plan_days d ON d.id=i.plan_day_id WHERE d.holiday_plan_id=$1 ORDER BY i.position FOR UPDATE OF i`,[internalId]);
    const itemId=validatePublicId(input.itemId,'Plan item identifier');const relativeId=validatePublicId(input.relativeItemId,'Relative plan item identifier');
    const current=rows.rows.find((row:any)=>row.public_id===itemId);const relative=rows.rows.find((row:any)=>row.public_id===relativeId);
    if(!current||!relative)throw new PlannerError('NOT_FOUND','Plan item not found.');
    const ordered=rows.rows.filter((row:any)=>String(row.plan_day_id)===String(relative.plan_day_id)&&row.id!==current.id);
    const relativeIndex=ordered.findIndex((row:any)=>row.id===relative.id);ordered.splice(relativeIndex+(input.placement==='after'?1:0),0,current);
    await client.query('UPDATE plan_items SET position=position+1000000 WHERE plan_day_id=$1',[relative.plan_day_id]);
    for(let index=0;index<ordered.length;index+=1)await client.query('UPDATE plan_items SET plan_day_id=$2,position=$3,updated_at=NOW() WHERE id=$1',[ordered[index].id,relative.plan_day_id,(index+1)*10]);
    return{value:undefined,action:'item_moved',summary:'Reordered a plan item by dragging.',changes:{itemId,relativeItemId:relativeId,placement:input.placement}};
  });return result.revision;
}
