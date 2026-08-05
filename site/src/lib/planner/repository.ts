import type { Pool, PoolClient } from 'pg';
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
  type PlanActor,
  type PlannerRevisionActor,
  type PlanDay,
  type PlanItem,
  type PlanItemStatus,
  type PlanItemType,
  type PlanItemVisibility,
  type PlanRevision,
} from './types.ts';

type Database = Pick<Pool, 'query' | 'connect'>;

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
       (holiday_plan_id, revision, actor_type, admin_user_id, source, action, summary, changes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
    [planInternalId, revision, administrator ? 'administrator' : 'guest',
      administrator ? actor.adminUserId : null, administrator ? 'admin' : 'guest',
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
      `INSERT INTO plan_participants
         (holiday_plan_id, role, participant_type, booking_id, display_name)
       VALUES ($1, 'owner', 'booker', $2, $3)`, [planInternalId, row.id, row.name],
    );
    await recordRevision(client, planInternalId, 1, input.actor, 'booking_plan_created',
      `Created an empty holiday plan for booking ${bookingReference}.`, { bookingReference, initialState: 'empty' });
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

async function lockPlan(
  client: PoolClient,
  planId: string,
  expectedRevision: number,
): Promise<{ internalId: string; revision: number }> {
  const result = await client.query<{ id: string | number; revision: number }>(
    'SELECT id, revision FROM holiday_plans WHERE public_id = $1::uuid FOR UPDATE',
    [validatePublicId(planId, 'Plan identifier')],
  );
  if (!result.rowCount) throw new PlannerError('NOT_FOUND', 'Holiday plan not found.');
  if (result.rows[0].revision !== expectedRevision) {
    throw new PlannerError('STALE_REVISION', 'The holiday plan has changed. Reload it before saving.');
  }
  return { internalId: String(result.rows[0].id), revision: result.rows[0].revision };
}

async function finishMutation(
  client: PoolClient,
  planInternalId: string,
  currentRevision: number,
  actor: PlanActor,
  action: string,
  summary: string,
  changes: Record<string, unknown>,
): Promise<number> {
  const revision = currentRevision + 1;
  await client.query(
    `UPDATE holiday_plans
        SET revision = $2, updated_by_admin_user_id = $3, updated_at = NOW()
      WHERE id = $1`,
    [planInternalId, revision, actor.adminUserId],
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
  input: { planId: string; expectedRevision: number; title: string; summary?: string; date?: string | null; actor: PlanActor },
  database: Database = getPool(),
): Promise<{ dayId: string; revision: number }> {
  const title = requireText(input.title, 'Day title', 160);
  const summary = input.summary?.trim() ?? '';
  if (summary.length > 3000) throw new PlannerError('VALIDATION_ERROR', 'Day summary is too long.');
  const dayDate = validateDate(input.date, 'Plan day date');
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    const plan = await lockPlan(client, input.planId, input.expectedRevision);
    await requireCompatibleDayDate(client, plan.internalId, dayDate);
    const created = await client.query<{ public_id: string }>(
      `INSERT INTO plan_days
         (holiday_plan_id, day_date, title, summary, position, created_by_admin_user_id, updated_by_admin_user_id)
       VALUES ($1, $2::date, $3, $4,
         COALESCE((SELECT max(position) + 10 FROM plan_days WHERE holiday_plan_id = $1), 10), $5, $5)
       RETURNING public_id::text`,
      [plan.internalId, dayDate, title, summary, input.actor.adminUserId],
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
    localGuideSlug?: string | null;
    status?: PlanItemStatus;
    reservationNote?: string | null;
    visibility?: PlanItemVisibility;
    actor: PlanActor;
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
  if (startTime && endTime && endTime <= startTime) {
    throw new PlannerError('VALIDATION_ERROR', 'Item end time must be after its start time.');
  }
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    const plan = await lockPlan(client, input.planId, input.expectedRevision);
    const created = await client.query<{ public_id: string }>(
      `INSERT INTO plan_items
         (plan_day_id, title, description, item_type, start_time, end_time, location_text,
          local_guide_slug, status, position, reservation_note, visibility,
          created_by_admin_user_id, updated_by_admin_user_id)
       SELECT d.id, $3, $4, $5, $6::time, $7::time, $8, $9, $10,
              COALESCE((SELECT max(position) + 10 FROM plan_items WHERE plan_day_id = d.id), 10),
              $11, $12, $13, $13
         FROM plan_days d
        WHERE d.public_id = $1::uuid AND d.holiday_plan_id = $2
       RETURNING public_id::text`,
      [validatePublicId(input.dayId, 'Plan day identifier'), plan.internalId, title, description, input.itemType, startTime,
        endTime, optionalText(input.locationText, 'Location', 500),
        validateGuideSlug(input.localGuideSlug), status,
        optionalText(input.reservationNote, 'Reservation note', 3000), visibility, input.actor.adminUserId],
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
       'localGuideSlug', i.local_guide_slug, 'status', i.status, 'position', i.position,
       'reservationNote', i.reservation_note, 'visibility', i.visibility
     ) ORDER BY i.position) FILTER (WHERE i.id IS NOT NULL), '[]'::jsonb) AS items
       FROM plan_days d LEFT JOIN plan_items i ON i.plan_day_id = d.id
      WHERE d.holiday_plan_id = $1 GROUP BY d.id ORDER BY d.position`,
    [row.id],
  );
  const revisionsResult = await database.query<any>('SELECT * FROM plan_revisions WHERE holiday_plan_id = $1 ORDER BY revision', [row.id]);
  const days: PlanDay[] = daysResult.rows.map((dayRow: any) => ({
    id: String(dayRow.public_id), date: date(dayRow.day_date), title: dayRow.title,
    summary: dayRow.summary, position: dayRow.position,
    items: dayRow.items.map((item: PlanItem) => ({ ...item, startTime: time(item.startTime), endTime: time(item.endTime) })),
  }));
  const revisions: PlanRevision[] = revisionsResult.rows.map((revisionRow: any) => ({
    revision: revisionRow.revision, actorType: revisionRow.actor_type,
    adminUserId: revisionRow.admin_user_id == null ? null : String(revisionRow.admin_user_id),
    source: revisionRow.source, action: revisionRow.action, summary: revisionRow.summary,
    changes: revisionRow.changes, createdAt: iso(revisionRow.created_at),
  }));
  return {
    id: String(row.public_id), planType: row.plan_type,
    bookingId: row.booking_id == null ? null : String(row.booking_id), title: row.title,
    description: row.description, publicationStatus: row.publication_status,
    visibility: row.visibility, publicSlug: row.public_slug, startsOn: date(row.starts_on), endsOn: date(row.ends_on),
    durationDays: row.duration_days, revision: row.revision,
    archivedAt: row.archived_at ? iso(row.archived_at) : null,
    createdAt: iso(row.created_at), updatedAt: iso(row.updated_at), days, revisions,
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
      await client.query(`INSERT INTO plan_items(plan_day_id,title,description,item_type,start_time,end_time,location_text,local_guide_slug,status,position,reservation_note,visibility,created_by_admin_user_id,updated_by_admin_user_id)
        SELECT $1,title,description,item_type,start_time,end_time,location_text,local_guide_slug,status,position,reservation_note,visibility,$2,$2 FROM plan_items WHERE plan_day_id=$3 ORDER BY position`,[newDay.rows[0].id,input.actor.adminUserId,day.id]);
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
  actor: PlanActor,
  mutation: (context: MutationContext) => Promise<{ value: T; action: string; summary: string; changes: Record<string, unknown> }>,
): Promise<{ value: T; revision: number }> {
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    const plan = await lockPlan(client, planId, expectedRevision);
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
  input: { planId: string; dayId: string; expectedRevision: number; title: string; summary?: string; date?: string | null; actor: PlanActor },
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
      [validatePublicId(input.dayId, 'Plan day identifier'), internalId, title, summary, dayDate, input.actor.adminUserId],
    );
    if (!updated.rowCount) throw new PlannerError('NOT_FOUND', 'Plan day not found.');
    return { value: undefined, action: 'day_updated', summary: `Updated day “${title}”.`, changes: { dayId: input.dayId, title, date: dayDate } };
  });
  return result.revision;
}

export async function removePlanDay(
  input: { planId: string; dayId: string; expectedRevision: number; actor: PlanActor },
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
  input: { planId: string; dayId: string; expectedRevision: number; direction: 'up' | 'down'; actor: PlanActor },
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
  reservationNote?: string | null; visibility?: PlanItemVisibility;
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
    locationText: optionalText(input.locationText, 'Location', 500), status,
    reservationNote: optionalText(input.reservationNote, 'Reservation note', 3000), visibility };
}

export async function updatePlanItem(input: ItemInput & {
  planId: string; itemId: string; expectedRevision: number; actor: PlanActor;
}, database: Database = getPool()): Promise<number> {
  const item = validatedItem(input);
  const result = await mutatePlan(database, input.planId, input.expectedRevision, input.actor, async ({ client, internalId }) => {
    const existing = await client.query<{ status: PlanItemStatus }>(
      `SELECT i.status FROM plan_items i JOIN plan_days d ON d.id=i.plan_day_id
       WHERE i.public_id=$1::uuid AND d.holiday_plan_id=$2 FOR UPDATE`,
      [validatePublicId(input.itemId, 'Plan item identifier'), internalId]);
    if (!existing.rowCount) throw new PlannerError('NOT_FOUND', 'Plan item not found.');
    validateItemStatusTransition(existing.rows[0].status, item.status);
    await client.query(`UPDATE plan_items SET title=$2,description=$3,item_type=$4,start_time=$5::time,
      end_time=$6::time,location_text=$7,status=$8,reservation_note=$9,visibility=$10,
      updated_by_admin_user_id=$11,updated_at=NOW() WHERE public_id=$1::uuid`,
      [input.itemId,item.title,item.description,item.itemType,item.startTime,item.endTime,item.locationText,item.status,item.reservationNote,item.visibility,input.actor.adminUserId]);
    return { value: undefined, action:'item_updated', summary:`Updated item “${item.title}”.`, changes:{itemId:input.itemId,status:item.status} };
  }); return result.revision;
}

export async function removePlanItem(input:{planId:string;itemId:string;expectedRevision:number;actor:PlanActor}, database:Database=getPool()):Promise<number>{
  const result=await mutatePlan(database,input.planId,input.expectedRevision,input.actor,async({client,internalId})=>{
    const removed=await client.query<{title:string}>(`DELETE FROM plan_items i USING plan_days d WHERE i.plan_day_id=d.id AND i.public_id=$1::uuid AND d.holiday_plan_id=$2 RETURNING i.title`,[validatePublicId(input.itemId,'Plan item identifier'),internalId]);
    if(!removed.rowCount) throw new PlannerError('NOT_FOUND','Plan item not found.');
    return {value:undefined,action:'item_removed',summary:`Removed item “${removed.rows[0].title}”.`,changes:{itemId:input.itemId}};
  }); return result.revision;
}

export async function setPlanItemGuideReference(input:{planId:string;itemId:string;localGuideSlug:string|null;expectedRevision:number;actor:PlanActor},database:Database=getPool()):Promise<number>{
  const slug=validateGuideSlug(input.localGuideSlug);
  const result=await mutatePlan(database,input.planId,input.expectedRevision,input.actor,async({client,internalId})=>{
    const updated=await client.query(`UPDATE plan_items i SET local_guide_slug=$3,updated_by_admin_user_id=$4,updated_at=NOW() FROM plan_days d WHERE i.plan_day_id=d.id AND i.public_id=$1::uuid AND d.holiday_plan_id=$2`,[validatePublicId(input.itemId,'Plan item identifier'),internalId,slug,input.actor.adminUserId]);
    if(!updated.rowCount) throw new PlannerError('NOT_FOUND','Plan item not found.');
    return {value:undefined,action:slug?'guide_reference_attached':'guide_reference_detached',summary:slug?`Linked plan item to Local Guide entry “${slug}”.`:'Detached Local Guide reference.',changes:{itemId:input.itemId,localGuideSlug:slug}};
  });return result.revision;
}

export async function movePlanItem(input:{planId:string;itemId:string;targetDayId:string;expectedRevision:number;position:'up'|'down'|'end';actor:PlanActor},database:Database=getPool()):Promise<number>{
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
      const next=await client.query<{position:number}>('SELECT COALESCE(max(position)+10,10)::int position FROM plan_items WHERE plan_day_id=$1',[targetDay.rows[0].id]);
      await client.query('UPDATE plan_items SET plan_day_id=$2,position=$3,updated_at=NOW() WHERE id=$1',[current.id,targetDay.rows[0].id,next.rows[0].position]);
    }
    return {value:undefined,action:'item_moved',summary:'Moved a plan item.',changes:{itemId:input.itemId,targetDayId:input.targetDayId,position:input.position}};
  });return result.revision;
}
