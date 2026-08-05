import type { APIRoute } from 'astro';
import { isSameOrigin } from '../../../../lib/admin/auth';
import {
  addPlanDay,
  addPlanItem,
  archiveExamplePlan,
  createExamplePlan,
  movePlanDay,
  movePlanItem,
  removePlanDay,
  removePlanItem,
  updateExamplePlan,
  updatePlanDay,
  updatePlanItem,
} from '../../../../lib/planner/repository.ts';
import { PlannerError } from '../../../../lib/planner/types.ts';

export const prerender = false;

type Input = Record<string, unknown>;
const text = (value: unknown) => String(value ?? '');
const nullableText = (value: unknown) => text(value).trim() || null;
const revision = (value: unknown) => Number(value);
const duration = (value: unknown) => nullableText(value) === null ? null : Number(value);

export const POST: APIRoute = async ({ request, locals }) => {
  if (!isSameOrigin(request)) return Response.json({ error: 'Cross-site request forbidden.' }, { status: 403 });
  const actor = { type: 'administrator' as const, adminUserId: locals.adminUser!.id };
  let input: Input;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: 'A valid JSON request is required.' }, { status: 400 });
  }

  try {
    switch (input.action) {
      case 'createPlan': {
        const plan = await createExamplePlan({
          title: text(input.title), description: text(input.description),
          startsOn: nullableText(input.startsOn), endsOn: nullableText(input.endsOn),
          durationDays: duration(input.durationDays), actor,
        });
        return Response.json({ plan });
      }
      case 'updatePlan':
        return Response.json({ revision: await updateExamplePlan({
          planId: text(input.planId), expectedRevision: revision(input.expectedRevision),
          title: text(input.title), description: text(input.description),
          startsOn: nullableText(input.startsOn), endsOn: nullableText(input.endsOn),
          durationDays: duration(input.durationDays), actor,
        }) });
      case 'archivePlan':
        return Response.json({ revision: await archiveExamplePlan({
          planId: text(input.planId), expectedRevision: revision(input.expectedRevision), actor,
        }) });
      case 'addDay': {
        const result = await addPlanDay({
          planId: text(input.planId), expectedRevision: revision(input.expectedRevision),
          title: text(input.title), summary: text(input.summary), date: nullableText(input.date), actor,
        });
        return Response.json(result);
      }
      case 'updateDay':
        return Response.json({ revision: await updatePlanDay({
          planId: text(input.planId), dayId: text(input.dayId), expectedRevision: revision(input.expectedRevision),
          title: text(input.title), summary: text(input.summary), date: nullableText(input.date), actor,
        }) });
      case 'removeDay':
        return Response.json({ revision: await removePlanDay({
          planId: text(input.planId), dayId: text(input.dayId), expectedRevision: revision(input.expectedRevision), actor,
        }) });
      case 'moveDay':
        if (input.direction !== 'up' && input.direction !== 'down') throw new PlannerError('VALIDATION_ERROR', 'Move direction is invalid.');
        return Response.json({ revision: await movePlanDay({
          planId: text(input.planId), dayId: text(input.dayId), expectedRevision: revision(input.expectedRevision),
          direction: input.direction, actor,
        }) });
      case 'addItem': {
        const result = await addPlanItem({ ...itemInput(input), planId:text(input.planId), dayId:text(input.dayId), expectedRevision:revision(input.expectedRevision), actor });
        return Response.json(result);
      }
      case 'updateItem':
        return Response.json({ revision: await updatePlanItem({ ...itemInput(input), planId:text(input.planId), itemId:text(input.itemId), expectedRevision:revision(input.expectedRevision), actor }) });
      case 'removeItem':
        return Response.json({ revision: await removePlanItem({ planId:text(input.planId), itemId:text(input.itemId), expectedRevision:revision(input.expectedRevision), actor }) });
      case 'moveItem':
        if (!['up','down','end'].includes(text(input.position))) throw new PlannerError('VALIDATION_ERROR','Item position is invalid.');
        return Response.json({ revision: await movePlanItem({ planId:text(input.planId), itemId:text(input.itemId), targetDayId:text(input.targetDayId), expectedRevision:revision(input.expectedRevision), position:text(input.position) as 'up'|'down'|'end', actor }) });
      default:
        return Response.json({ error: 'Planner action is invalid.' }, { status: 400 });
    }
  } catch (error) {
    if (error instanceof PlannerError) {
      const status = error.code === 'NOT_FOUND' ? 404 : error.code === 'STALE_REVISION' ? 409 : 400;
      return Response.json({ error: error.message, code: error.code }, { status });
    }
    console.error('Admin planner action failed', error);
    return Response.json({ error: 'The planner action could not be completed.' }, { status: 500 });
  }
};

function itemInput(input: Input) {
  return { title:text(input.title), description:text(input.description), itemType:text(input.itemType) as any,
    startTime:nullableText(input.startTime), endTime:nullableText(input.endTime), locationText:nullableText(input.locationText),
    status:text(input.status) as any, reservationNote:nullableText(input.reservationNote), visibility:text(input.visibility) as any };
}
