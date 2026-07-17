import type { APIRoute } from 'astro';
import { getProperty } from '../../../../lib/booking/config';
import { isIsoDate } from '../../../../lib/booking/dates';
import { audit, isSameOrigin } from '../../../../lib/admin/auth';
import { RULE_CATALOG } from '../../../../lib/pricing/catalog';
import { simulatePricing } from '../../../../lib/pricing/engine';
import {
  addPricingRule,
  createBlankPricingPlan,
  createDraftFromPlan,
  deletePricingRule,
  getPricingPlan,
  getPublishedPricingPlan,
  logPricingSimulation,
  publishPricingPlan,
  renameDraftPlan,
  reorderPricingRules,
  updatePricingRule,
} from '../../../../lib/pricing/repository';
import type { PricingAction, PricingConditions, PricingRuleType, PricingSimulationInput } from '../../../../lib/pricing/types';

export const prerender = false;

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};
}

function text(value: unknown, maximum = 160): string {
  return String(value ?? '').trim().slice(0, maximum);
}

function number(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boolean(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function conditions(value: unknown): PricingConditions {
  const input = object(value);
  const output: PricingConditions = {};
  if (Array.isArray(input.listingIds)) output.listingIds = input.listingIds.map((item) => text(item, 80)).filter(Boolean).slice(0, 20);
  if (isIsoDate(text(input.arrivalDateFrom, 10))) output.arrivalDateFrom = text(input.arrivalDateFrom, 10);
  if (isIsoDate(text(input.arrivalDateTo, 10))) output.arrivalDateTo = text(input.arrivalDateTo, 10);
  for (const key of ['minimumNights', 'maximumNights', 'minimumLeadDays', 'maximumLeadDays'] as const) {
    if (input[key] !== undefined && input[key] !== '') output[key] = Math.max(0, Math.round(number(input[key])));
  }
  if (input.channel) output.channel = text(input.channel, 40);
  if (input.cancellationPlan) output.cancellationPlan = text(input.cancellationPlan, 40);
  return output;
}

function ruleAction(value: unknown): PricingAction {
  const input = object(value);
  const output: PricingAction = {};
  if (input.amountPence !== undefined && input.amountPence !== '') output.amountPence = Math.max(0, Math.round(number(input.amountPence)));
  if (input.percentage !== undefined && input.percentage !== '') output.percentage = Math.max(-100, Math.min(1000, number(input.percentage)));
  if (Array.isArray(input.daysOfWeek)) output.daysOfWeek = input.daysOfWeek.map((item) => Math.round(number(item))).filter((item) => item >= 0 && item <= 6);
  if (input.nights !== undefined && input.nights !== '') output.nights = Math.max(1, Math.round(number(input.nights)));
  if (input.includedGuests !== undefined && input.includedGuests !== '') output.includedGuests = Math.max(0, Math.round(number(input.includedGuests)));
  if (input.perNight !== undefined) output.perNight = boolean(input.perNight);
  if (input.perPet !== undefined) output.perPet = boolean(input.perPet);
  return output;
}

function validRuleType(value: unknown): value is PricingRuleType {
  return RULE_CATALOG.some((entry) => entry.type === value);
}

function errorResponse(error: unknown): Response {
  const code = error instanceof Error ? error.message : 'UNKNOWN';
  const clientErrors: Record<string, string> = {
    PLAN_NOT_FOUND: 'Pricing plan not found.',
    DRAFT_PLAN_NOT_FOUND: 'Only a draft pricing plan can be changed.',
    DRAFT_RULE_NOT_FOUND: 'Only rules in a draft plan can be changed.',
    PLAN_NAME_REQUIRED: 'Enter a pricing plan name.',
    INVALID_RULE_ORDER: 'The rule order did not match the selected plan.',
    BASE_PRICE_REQUIRED: 'A published plan must contain an enabled default nightly price.',
  };
  if (clientErrors[code]) return Response.json({ error: clientErrors[code] }, { status: 400 });
  console.error(error);
  return Response.json({ error: 'The pricing operation could not be completed.' }, { status: 500 });
}

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.adminUser) return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  if (!isSameOrigin(request)) return Response.json({ error: 'Cross-origin request rejected.' }, { status: 403 });
  if (!request.headers.get('content-type')?.includes('application/json')) {
    return Response.json({ error: 'JSON request required.' }, { status: 415 });
  }

  try {
    const input = object(await request.json());
    const action = text(input.action, 40);
    const userId = locals.adminUser.id;

    if (action === 'createPlan') {
      const propertyId = text(input.propertyId, 80);
      const property = getProperty(propertyId);
      if (!property) return Response.json({ error: 'Unknown listing.' }, { status: 400 });
      const plan = await createBlankPricingPlan(propertyId, text(input.name, 160) || `${property.name} — pricing draft`, userId);
      await audit(userId, 'pricing.plan.created', { propertyId, planId: plan.id });
      return Response.json({ plan }, { status: 201 });
    }

    if (action === 'addRule') {
      const planId = text(input.planId, 30);
      if (!validRuleType(input.ruleType)) return Response.json({ error: 'Unknown pricing rule type.' }, { status: 400 });
      const rule = await addPricingRule(planId, input.ruleType, userId);
      await audit(userId, 'pricing.rule.added', { planId, ruleId: rule.id, type: rule.type });
      return Response.json({ rule }, { status: 201 });
    }

    if (action === 'updateRule') {
      const rule = await updatePricingRule({
        ruleId: text(input.ruleId, 30),
        name: text(input.name, 160),
        priority: number(input.priority, 50),
        enabled: boolean(input.enabled),
        stackable: boolean(input.stackable),
        stackingGroup: text(input.stackingGroup, 80) || null,
        conditions: conditions(input.conditions),
        action: ruleAction(input.ruleAction),
      });
      await audit(userId, 'pricing.rule.updated', { planId: rule.planId, ruleId: rule.id, type: rule.type });
      return Response.json({ rule });
    }

    if (action === 'deleteRule') {
      const ruleId = text(input.ruleId, 30);
      const planId = await deletePricingRule(ruleId);
      await audit(userId, 'pricing.rule.deleted', { planId, ruleId });
      return Response.json({ ok: true });
    }

    if (action === 'reorderRules') {
      const planId = text(input.planId, 30);
      const ruleIds = Array.isArray(input.ruleIds) ? input.ruleIds.map((id) => text(id, 30)).filter(Boolean) : [];
      await reorderPricingRules(planId, ruleIds);
      await audit(userId, 'pricing.rules.reordered', { planId, ruleIds });
      return Response.json({ ok: true });
    }

    if (action === 'duplicatePlan') {
      const sourcePlanId = text(input.planId, 30);
      const plan = await createDraftFromPlan(sourcePlanId, userId);
      await audit(userId, 'pricing.plan.duplicated', { sourcePlanId, planId: plan.id });
      return Response.json({ plan }, { status: 201 });
    }

    if (action === 'renamePlan') {
      const planId = text(input.planId, 30);
      await renameDraftPlan(planId, text(input.name, 160));
      await audit(userId, 'pricing.plan.renamed', { planId });
      return Response.json({ ok: true });
    }

    if (action === 'publishPlan') {
      const planId = text(input.planId, 30);
      await publishPricingPlan(planId, userId);
      await audit(userId, 'pricing.plan.published', { planId });
      return Response.json({ ok: true });
    }

    if (action === 'simulate') {
      const planId = text(input.planId, 30);
      const simulationInputRaw = object(input.simulationInput);
      const propertyId = text(simulationInputRaw.propertyId, 80);
      const property = getProperty(propertyId);
      if (!property) return Response.json({ error: 'Unknown listing.' }, { status: 400 });
      const simulationInput: PricingSimulationInput = {
        propertyId,
        arrival: text(simulationInputRaw.arrival, 10),
        departure: text(simulationInputRaw.departure, 10),
        bookingDate: text(simulationInputRaw.bookingDate, 10),
        guests: Math.round(number(simulationInputRaw.guests, 1)),
        pets: Math.round(number(simulationInputRaw.pets, 0)),
        channel: text(simulationInputRaw.channel, 40) || 'direct',
        cancellationPlan: text(simulationInputRaw.cancellationPlan, 40) || 'flexible',
      };
      if (simulationInput.guests > property.maximumGuests) {
        return Response.json({ error: `The selected listing allows at most ${property.maximumGuests} guests.` }, { status: 400 });
      }
      const plan = await getPricingPlan(planId);
      if (!plan || plan.propertyId !== propertyId) return Response.json({ error: 'Pricing plan not found for this listing.' }, { status: 404 });
      const result = simulatePricing(plan, simulationInput);
      await logPricingSimulation(plan.id, userId, simulationInput, result);

      const published = await getPublishedPricingPlan(propertyId);
      const comparisonResult = published && published.id !== plan.id ? simulatePricing(published, simulationInput) : null;
      return Response.json({
        plan: { id: plan.id, name: plan.name, status: plan.status },
        result,
        comparison: comparisonResult && published ? {
          plan: { id: published.id, name: published.name, status: published.status },
          result: comparisonResult,
          difference: {
            guestTotalPence: result.guestTotalPence - comparisonResult.guestTotalPence,
            ownerRevenuePence: result.ownerRevenuePence - comparisonResult.ownerRevenuePence,
            averageNightlyPence: result.averageNightlyPence - comparisonResult.averageNightlyPence,
          },
        } : null,
      }, { headers: { 'cache-control': 'no-store' } });
    }

    return Response.json({ error: 'Unknown pricing action.' }, { status: 400 });
  } catch (error) {
    return errorResponse(error);
  }
};
