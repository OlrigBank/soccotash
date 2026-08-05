import type { APIRoute } from 'astro';
import { isSameOrigin } from '../../../../lib/admin/auth.ts';
import { resolveBookingAccessCredential } from '../../../../lib/booking/booking-access.ts';
import {
  addPlanDay, addPlanItem, changePlanParticipantRole, createPlanShareLink, getBookingLinkedPlanByBookingReference, getHolidayPlan,
  invitePlanParticipant, movePlanDay, movePlanItem, revokePlanShareLink,
  offerGuideContribution, removePlanDay, removePlanItem, setPlanItemGuideReference, updateBookingLinkedPlan,
  updatePlanDay, updatePlanItem, revokePlanParticipant, withdrawGuideContribution,
} from '../../../../lib/planner/repository.ts';
import { requirePlannerGuideEntry } from '../../../../lib/planner/local-guide.ts';
import { PlannerError } from '../../../../lib/planner/types.ts';

export const prerender = false;
type Input = Record<string, unknown>;
const text = (value: unknown) => String(value ?? '');
const nullable = (value: unknown) => text(value).trim() || null;

export const POST: APIRoute = async ({ params, request }) => {
  if (!isSameOrigin(request)) return Response.json({ error: 'Cross-site request forbidden.' }, { status: 403 });
  const access = await resolveBookingAccessCredential(text(params.token), { recordUse: true, recordDenied: true });
  if (!access.allowed) return Response.json({ error: 'Holiday plan not found.' }, { status: 404 });
  const plan = await getBookingLinkedPlanByBookingReference(access.reference);
  if (!plan) return Response.json({ error: 'Holiday plan not found.' }, { status: 404 });
  const input = await request.json().catch(() => null) as Input | null;
  if (!input) return Response.json({ error: 'A valid JSON request is required.' }, { status: 400 });
  const expectedRevision = Number(input.expectedRevision);
  const actor = { type: 'booker' as const, bookingId: access.bookingId };
  try {
    let result: Record<string, unknown>;
    switch (input.action) {
      case 'updatePlan': result = { revision: await updateBookingLinkedPlan({ planId:plan.id,expectedRevision,title:text(input.title),description:text(input.description),actor }) }; break;
      case 'addDay': result = await addPlanDay({ planId:plan.id,expectedRevision,title:text(input.title),summary:text(input.summary),date:nullable(input.date),actor }); break;
      case 'updateDay': result = { revision:await updatePlanDay({ planId:plan.id,dayId:text(input.dayId),expectedRevision,title:text(input.title),summary:text(input.summary),date:nullable(input.date),actor }) }; break;
      case 'removeDay': result = { revision:await removePlanDay({ planId:plan.id,dayId:text(input.dayId),expectedRevision,actor }) }; break;
      case 'moveDay':
        if (!['up','down'].includes(text(input.direction))) throw new PlannerError('VALIDATION_ERROR','Move direction is invalid.');
        result={revision:await movePlanDay({planId:plan.id,dayId:text(input.dayId),expectedRevision,direction:text(input.direction) as 'up'|'down',actor})}; break;
      case 'addItem': {
        const slug=nullable(input.localGuideSlug); if(slug) await requirePlannerGuideEntry(slug);
        result=await addPlanItem({ ...item(input),planId:plan.id,dayId:text(input.dayId),expectedRevision,localGuideSlug:slug,actor }); break;
      }
      case 'updateItem': result={revision:await updatePlanItem({...item(input),planId:plan.id,itemId:text(input.itemId),expectedRevision,actor})}; break;
      case 'removeItem': result={revision:await removePlanItem({planId:plan.id,itemId:text(input.itemId),expectedRevision,actor})}; break;
      case 'setGuideReference': {
        const slug=nullable(input.localGuideSlug); if(slug) await requirePlannerGuideEntry(slug);
        result={revision:await setPlanItemGuideReference({planId:plan.id,itemId:text(input.itemId),localGuideSlug:slug,expectedRevision,actor})}; break;
      }
      case 'moveItem':
        if(!['up','down','end'].includes(text(input.position))) throw new PlannerError('VALIDATION_ERROR','Item position is invalid.');
        result={revision:await movePlanItem({planId:plan.id,itemId:text(input.itemId),targetDayId:text(input.targetDayId),expectedRevision,position:text(input.position) as 'up'|'down'|'end',actor})}; break;
      case 'inviteParticipant': result=await invitePlanParticipant({planId:plan.id,expectedRevision,displayName:text(input.displayName),email:text(input.email),role:text(input.role) as any,actor}); break;
      case 'changeParticipantRole': result={revision:await changePlanParticipantRole({planId:plan.id,participantId:text(input.participantId),expectedRevision,role:text(input.role) as any,actor})}; break;
      case 'revokeParticipant': result={revision:await revokePlanParticipant({planId:plan.id,participantId:text(input.participantId),expectedRevision,actor})}; break;
      case 'offerGuideContribution': result=await offerGuideContribution({planId:plan.id,itemId:text(input.itemId),expectedRevision,offeredTitle:text(input.offeredTitle),offeredDescription:text(input.offeredDescription),offeredLocationText:nullable(input.offeredLocationText),consent:input.consent===true,attributionPermitted:input.attributionPermitted===true,actor}); break;
      case 'withdrawGuideContribution': result={revision:await withdrawGuideContribution({planId:plan.id,candidateId:text(input.candidateId),expectedRevision,actor})}; break;
      case 'createShareLink': result=await createPlanShareLink({planId:plan.id,expectedRevision,expiresDays:Number(input.expiresDays),actor}); break;
      case 'revokeShareLink': result={revision:await revokePlanShareLink({planId:plan.id,shareId:text(input.shareId),expectedRevision,actor})}; break;
      default: return Response.json({error:'Planner action is invalid.'},{status:400});
    }
    return Response.json(result);
  } catch(error) {
    if(error instanceof PlannerError) {
      if(error.code==='STALE_REVISION'){
        const currentRevision=(await getHolidayPlan(plan.id))?.revision??plan.revision;
        console.warn('Booker planner revision conflict',{bookingReference:access.reference,expectedRevision,currentRevision});
        return Response.json({error:error.message,code:error.code,currentRevision},{status:409});
      }
      return Response.json({error:error.message,code:error.code},{status:error.code==='NOT_FOUND'?404:400});
    }
    console.error('Booker planner action failed', { action: input.action, bookingReference: access.reference });
    return Response.json({error:'The planner action could not be completed.'},{status:500});
  }
};

function item(input:Input){return {title:text(input.title),description:text(input.description),itemType:text(input.itemType) as any,startTime:nullable(input.startTime),endTime:nullable(input.endTime),locationText:nullable(input.locationText),status:text(input.status) as any,reservationNote:nullable(input.reservationNote),visibility:'participants' as const};}
