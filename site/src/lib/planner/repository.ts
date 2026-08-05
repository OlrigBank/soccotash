import type { Pool, PoolClient } from 'pg';
import { getPool } from '../booking/db.ts';
import {
  PLAN_ITEM_STATUSES,
  PLAN_ITEM_TYPES,
  PLAN_ITEM_VISIBILITIES,
  PlannerError,
  optionalText,
  requireText,
  validateGuideSlug,
  type HolidayPlan,
  type PlanActor,
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
  actor: PlanActor,
  action: string,
  summary: string,
  changes: Record<string, unknown>,
): Promise<void> {
  await client.query(
    `INSERT INTO plan_revisions
       (holiday_plan_id, revision, actor_type, admin_user_id, source, action, summary, changes)
     VALUES ($1, $2, 'administrator', $3, 'admin', $4, $5, $6::jsonb)`,
    [planInternalId, revision, actor.adminUserId, action, summary, JSON.stringify(changes)],
  );
}

async function lockPlan(
  client: PoolClient,
  planId: string,
  expectedRevision: number,
): Promise<{ internalId: string; revision: number }> {
  const result = await client.query<{ id: string | number; revision: number }>(
    'SELECT id, revision FROM holiday_plans WHERE public_id = $1::uuid FOR UPDATE',
    [planId],
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
  if ((input.startsOn == null) !== (input.endsOn == null)) {
    throw new PlannerError('VALIDATION_ERROR', 'Plan start and end dates must be supplied together.');
  }
  if (input.startsOn && input.endsOn && input.endsOn < input.startsOn) {
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
      [title, description, input.startsOn ?? null, input.endsOn ?? null, input.durationDays ?? null, input.actor.adminUserId],
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
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    const plan = await lockPlan(client, input.planId, input.expectedRevision);
    const created = await client.query<{ public_id: string }>(
      `INSERT INTO plan_days
         (holiday_plan_id, day_date, title, summary, position, created_by_admin_user_id, updated_by_admin_user_id)
       VALUES ($1, $2::date, $3, $4,
         COALESCE((SELECT max(position) + 10 FROM plan_days WHERE holiday_plan_id = $1), 10), $5, $5)
       RETURNING public_id::text`,
      [plan.internalId, input.date ?? null, title, summary, input.actor.adminUserId],
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
  if (input.startTime && input.endTime && input.endTime <= input.startTime) {
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
      [input.dayId, plan.internalId, title, description, input.itemType, input.startTime ?? null,
        input.endTime ?? null, optionalText(input.locationText, 'Location', 500),
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
  const plans = await database.query<any>('SELECT * FROM holiday_plans WHERE public_id = $1::uuid', [planId]);
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
    visibility: row.visibility, startsOn: date(row.starts_on), endsOn: date(row.ends_on),
    durationDays: row.duration_days, revision: row.revision,
    archivedAt: row.archived_at ? iso(row.archived_at) : null,
    createdAt: iso(row.created_at), updatedAt: iso(row.updated_at), days, revisions,
  };
}
