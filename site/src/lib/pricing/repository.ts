import type { PoolClient } from 'pg';
import { getPool } from '../booking/db';
import { defaultRuleValues } from './catalog';
import type {
  PricingAction,
  PricingConditions,
  PricingPlan,
  PricingPlanStatus,
  PricingRule,
  PricingRuleType,
  PricingSimulationInput,
  PricingSimulationResult,
} from './types';

type PlanRow = {
  id: string | number;
  property_id: string;
  name: string;
  status: PricingPlanStatus;
  currency: string;
  version: number;
  based_on_plan_id: string | number | null;
  published_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type RuleRow = {
  id: string | number;
  plan_id: string | number;
  type: PricingRuleType;
  name: string;
  position: number;
  priority: number;
  enabled: boolean;
  stackable: boolean;
  stacking_group: string | null;
  conditions: PricingConditions;
  action: PricingAction;
  created_at: Date | string;
  updated_at: Date | string;
};

export type PricingPlanSummary = Omit<PricingPlan, 'rules'> & { ruleCount: number };

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function planFromRow(row: PlanRow, rules: PricingRule[] = []): PricingPlan {
  return {
    id: String(row.id),
    propertyId: row.property_id,
    name: row.name,
    status: row.status,
    currency: row.currency,
    version: row.version,
    basedOnPlanId: row.based_on_plan_id === null ? null : String(row.based_on_plan_id),
    publishedAt: row.published_at ? iso(row.published_at) : null,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    rules,
  };
}

function ruleFromRow(row: RuleRow): PricingRule {
  return {
    id: String(row.id),
    planId: String(row.plan_id),
    type: row.type,
    name: row.name,
    position: row.position,
    priority: row.priority,
    enabled: row.enabled,
    stackable: row.stackable,
    stackingGroup: row.stacking_group,
    conditions: row.conditions || {},
    action: row.action || {},
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

async function rulesForPlan(planId: string, client: PoolClient | ReturnType<typeof getPool> = getPool()): Promise<PricingRule[]> {
  const result = await client.query<RuleRow>(
    `SELECT id, plan_id, type, name, position, priority, enabled, stackable,
            stacking_group, conditions, action, created_at, updated_at
       FROM pricing_rules
      WHERE plan_id = $1
      ORDER BY position, priority DESC, id`,
    [planId],
  );
  return result.rows.map(ruleFromRow);
}

export async function getPricingPlans(propertyId: string): Promise<PricingPlanSummary[]> {
  const result = await getPool().query<PlanRow & { rule_count: number }>(
    `SELECT p.*, count(r.id)::int AS rule_count
       FROM pricing_plans p
       LEFT JOIN pricing_rules r ON r.plan_id = p.id
      WHERE p.property_id = $1
      GROUP BY p.id
      ORDER BY CASE p.status WHEN 'draft' THEN 0 WHEN 'published' THEN 1 ELSE 2 END,
               p.updated_at DESC`,
    [propertyId],
  );
  return result.rows.map((row) => ({ ...planFromRow(row), ruleCount: row.rule_count }));
}

export async function getPricingPlan(planId: string): Promise<PricingPlan | null> {
  const result = await getPool().query<PlanRow>(
    `SELECT * FROM pricing_plans WHERE id = $1`,
    [planId],
  );
  if (!result.rowCount) return null;
  return planFromRow(result.rows[0], await rulesForPlan(planId));
}

export async function getPublishedPricingPlan(propertyId: string): Promise<PricingPlan | null> {
  const result = await getPool().query<PlanRow>(
    `SELECT * FROM pricing_plans WHERE property_id = $1 AND status = 'published' LIMIT 1`,
    [propertyId],
  );
  if (!result.rowCount) return null;
  return planFromRow(result.rows[0], await rulesForPlan(String(result.rows[0].id)));
}


export async function createBlankPricingPlan(propertyId: string, name: string, adminUserId: string): Promise<PricingPlan> {
  const versionResult = await getPool().query<{ version: number }>(
    'SELECT COALESCE(max(version), 0)::int + 1 AS version FROM pricing_plans WHERE property_id = $1',
    [propertyId],
  );
  const result = await getPool().query<PlanRow>(
    `INSERT INTO pricing_plans (property_id, name, status, currency, version, created_by)
     VALUES ($1, $2, 'draft', 'GBP', $3, $4)
     RETURNING *`,
    [propertyId, name.trim().slice(0, 160), versionResult.rows[0].version, adminUserId],
  );
  return planFromRow(result.rows[0], []);
}

export async function createDraftFromPlan(planId: string, adminUserId: string): Promise<PricingPlan> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const sourceResult = await client.query<PlanRow>('SELECT * FROM pricing_plans WHERE id = $1 FOR SHARE', [planId]);
    if (!sourceResult.rowCount) throw new Error('PLAN_NOT_FOUND');
    const source = sourceResult.rows[0];
    const versionResult = await client.query<{ version: number }>(
      'SELECT COALESCE(max(version), 0)::int + 1 AS version FROM pricing_plans WHERE property_id = $1',
      [source.property_id],
    );
    const created = await client.query<PlanRow>(
      `INSERT INTO pricing_plans
       (property_id, name, status, currency, version, based_on_plan_id, created_by)
       VALUES ($1, $2, 'draft', $3, $4, $5, $6)
       RETURNING *`,
      [source.property_id, `${source.name.replace(/ — draft.*$/u, '')} — draft v${versionResult.rows[0].version}`, source.currency, versionResult.rows[0].version, source.id, adminUserId],
    );
    const newPlanId = String(created.rows[0].id);
    await client.query(
      `INSERT INTO pricing_rules
       (plan_id, type, name, position, priority, enabled, stackable, stacking_group, conditions, action, created_by)
       SELECT $1, type, name, position, priority, enabled, stackable, stacking_group, conditions, action, $2
         FROM pricing_rules
        WHERE plan_id = $3
        ORDER BY position`,
      [newPlanId, adminUserId, planId],
    );
    await client.query('COMMIT');
    return planFromRow(created.rows[0], await rulesForPlan(newPlanId));
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function renameDraftPlan(planId: string, name: string): Promise<void> {
  const cleanName = name.trim().slice(0, 160);
  if (cleanName.length < 3) throw new Error('PLAN_NAME_REQUIRED');
  const result = await getPool().query(
    `UPDATE pricing_plans SET name = $2, updated_at = NOW()
      WHERE id = $1 AND status = 'draft'`,
    [planId, cleanName],
  );
  if (!result.rowCount) throw new Error('DRAFT_PLAN_NOT_FOUND');
}

export async function addPricingRule(planId: string, type: PricingRuleType, adminUserId: string): Promise<PricingRule> {
  const defaults = defaultRuleValues(type);
  const result = await getPool().query<RuleRow>(
    `INSERT INTO pricing_rules
       (plan_id, type, name, position, priority, enabled, stackable, stacking_group, conditions, action, created_by)
     SELECT p.id, $2, $3,
            COALESCE((SELECT max(position) + 10 FROM pricing_rules WHERE plan_id = p.id), 10),
            $4, TRUE, $5, $6, $7::jsonb, $8::jsonb, $9
       FROM pricing_plans p
      WHERE p.id = $1 AND p.status = 'draft'
     RETURNING id, plan_id, type, name, position, priority, enabled, stackable,
               stacking_group, conditions, action, created_at, updated_at`,
    [planId, type, defaults.name, defaults.priority, defaults.stackable, defaults.stackingGroup, JSON.stringify(defaults.conditions), JSON.stringify(defaults.action), adminUserId],
  );
  if (!result.rowCount) throw new Error('DRAFT_PLAN_NOT_FOUND');
  await touchPlan(planId);
  return ruleFromRow(result.rows[0]);
}

export async function updatePricingRule(input: {
  ruleId: string;
  name: string;
  priority: number;
  enabled: boolean;
  stackable: boolean;
  stackingGroup: string | null;
  conditions: PricingConditions;
  action: PricingAction;
}): Promise<PricingRule> {
  const result = await getPool().query<RuleRow>(
    `UPDATE pricing_rules r
        SET name = $2,
            priority = $3,
            enabled = $4,
            stackable = $5,
            stacking_group = $6,
            conditions = $7::jsonb,
            action = $8::jsonb,
            updated_at = NOW()
       FROM pricing_plans p
      WHERE r.id = $1 AND p.id = r.plan_id AND p.status = 'draft'
      RETURNING r.id, r.plan_id, r.type, r.name, r.position, r.priority, r.enabled,
                r.stackable, r.stacking_group, r.conditions, r.action, r.created_at, r.updated_at`,
    [
      input.ruleId,
      input.name.trim().slice(0, 160),
      Math.max(0, Math.min(999, Math.round(input.priority))),
      input.enabled,
      input.stackable,
      input.stackingGroup?.trim().slice(0, 80) || null,
      JSON.stringify(input.conditions || {}),
      JSON.stringify(input.action || {}),
    ],
  );
  if (!result.rowCount) throw new Error('DRAFT_RULE_NOT_FOUND');
  await touchPlan(String(result.rows[0].plan_id));
  return ruleFromRow(result.rows[0]);
}

export async function deletePricingRule(ruleId: string): Promise<string> {
  const result = await getPool().query<{ plan_id: string | number }>(
    `DELETE FROM pricing_rules r
      USING pricing_plans p
      WHERE r.id = $1 AND p.id = r.plan_id AND p.status = 'draft'
      RETURNING r.plan_id`,
    [ruleId],
  );
  if (!result.rowCount) throw new Error('DRAFT_RULE_NOT_FOUND');
  const planId = String(result.rows[0].plan_id);
  await compactRulePositions(planId);
  await touchPlan(planId);
  return planId;
}

export async function reorderPricingRules(planId: string, ruleIds: string[]): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const plan = await client.query<{ status: PricingPlanStatus }>('SELECT status FROM pricing_plans WHERE id = $1 FOR UPDATE', [planId]);
    if (!plan.rowCount || plan.rows[0].status !== 'draft') throw new Error('DRAFT_PLAN_NOT_FOUND');
    const existing = await client.query<{ id: string | number }>('SELECT id FROM pricing_rules WHERE plan_id = $1 ORDER BY position', [planId]);
    const existingIds = existing.rows.map((row) => String(row.id));
    if (ruleIds.length !== existingIds.length || ruleIds.some((id) => !existingIds.includes(id))) throw new Error('INVALID_RULE_ORDER');
    await client.query('UPDATE pricing_rules SET position = -position - 1 WHERE plan_id = $1', [planId]);
    for (const [index, id] of ruleIds.entries()) {
      await client.query('UPDATE pricing_rules SET position = $3, updated_at = NOW() WHERE id = $1 AND plan_id = $2', [id, planId, (index + 1) * 10]);
    }
    await client.query('UPDATE pricing_plans SET updated_at = NOW() WHERE id = $1', [planId]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function publishPricingPlan(planId: string, adminUserId: string): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const planResult = await client.query<PlanRow>('SELECT * FROM pricing_plans WHERE id = $1 FOR UPDATE', [planId]);
    if (!planResult.rowCount || planResult.rows[0].status !== 'draft') throw new Error('DRAFT_PLAN_NOT_FOUND');
    const plan = planResult.rows[0];
    const baseRule = await client.query('SELECT 1 FROM pricing_rules WHERE plan_id = $1 AND enabled = TRUE AND type = $2 LIMIT 1', [planId, 'default_nightly_price']);
    if (!baseRule.rowCount) throw new Error('BASE_PRICE_REQUIRED');
    await client.query(
      `UPDATE pricing_plans
          SET status = 'archived', updated_at = NOW()
        WHERE property_id = $1 AND status = 'published'`,
      [plan.property_id],
    );
    await client.query(
      `UPDATE pricing_plans
          SET status = 'published', published_at = NOW(), published_by = $2, updated_at = NOW()
        WHERE id = $1`,
      [planId, adminUserId],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function logPricingSimulation(
  planId: string,
  adminUserId: string,
  input: PricingSimulationInput,
  result: PricingSimulationResult,
): Promise<void> {
  await getPool().query(
    `INSERT INTO pricing_simulation_log (plan_id, admin_user_id, input, result)
     VALUES ($1, $2, $3::jsonb, $4::jsonb)`,
    [planId, adminUserId, JSON.stringify(input), JSON.stringify(result)],
  );
}

export async function countPricingPlans(): Promise<number> {
  const result = await getPool().query<{ count: number }>('SELECT count(*)::int AS count FROM pricing_plans');
  return result.rows[0]?.count ?? 0;
}

async function touchPlan(planId: string): Promise<void> {
  await getPool().query('UPDATE pricing_plans SET updated_at = NOW() WHERE id = $1', [planId]);
}

async function compactRulePositions(planId: string): Promise<void> {
  const result = await getPool().query<{ id: string | number }>('SELECT id FROM pricing_rules WHERE plan_id = $1 ORDER BY position, id', [planId]);
  if (!result.rowCount) return;
  await reorderPricingRules(planId, result.rows.map((row) => String(row.id)));
}
