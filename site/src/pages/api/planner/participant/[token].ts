import type { APIRoute } from 'astro';
import { isSameOrigin } from '../../../../lib/admin/auth.ts';
import { resolveParticipantCredential } from '../../../../lib/planner/participant-access.ts';
import {
  addPlanDay, addPlanItem, getHolidayPlan, movePlanDay, movePlanItem, offerGuideContribution, removePlanDay,
  removePlanItem, setPlanItemGuideReference, updateBookingLinkedPlan, updatePlanDay, updatePlanItem, withdrawGuideContribution,
} from '../../../../lib/planner/repository.ts';
import { requirePlannerGuideEntry } from '../../../../lib/planner/local-guide.ts';
import { PlannerError } from '../../../../lib/planner/types.ts';

export const prerender=false;
type Input=Record<string,unknown>;
const text=(value:unknown)=>String(value??'');
const nullable=(value:unknown)=>text(value).trim()||null;

export const POST:APIRoute=async({params,request})=>{
  if(!isSameOrigin(request))return Response.json({error:'Cross-site request forbidden.'},{status:403});
  const access=await resolveParticipantCredential(text(params.token),true);
  if(!access)return Response.json({error:'Holiday plan not found.'},{status:404});
  if(access.role==='viewer')return Response.json({error:'This invitation has view-only access.'},{status:403});
  const plan=await getHolidayPlan(access.planId);
  if(!plan)return Response.json({error:'Holiday plan not found.'},{status:404});
  const input=await request.json().catch(()=>null) as Input|null;
  if(!input)return Response.json({error:'A valid JSON request is required.'},{status:400});
  const expectedRevision=Number(input.expectedRevision);
  const actor={type:'participant' as const,participantId:access.participantId,planId:access.planId,role:access.role};
  try{
    if(input.action==='offerGuideContribution')return Response.json(await offerGuideContribution({planId:plan.id,itemId:text(input.itemId),expectedRevision,offeredTitle:text(input.offeredTitle),offeredDescription:text(input.offeredDescription),offeredLocationText:nullable(input.offeredLocationText),consent:input.consent===true,attributionPermitted:input.attributionPermitted===true,actor}));
    if(input.action==='withdrawGuideContribution')return Response.json({revision:await withdrawGuideContribution({planId:plan.id,candidateId:text(input.candidateId),expectedRevision,actor})});
    if(access.role==='contributor'){
      if(input.action!=='addItem')return Response.json({error:'Contributors may propose activities but cannot change the plan structure.'},{status:403});
      const slug=nullable(input.localGuideSlug);if(slug)await requirePlannerGuideEntry(slug);
      return Response.json(await addPlanItem({planId:plan.id,dayId:text(input.dayId),expectedRevision,title:text(input.title),description:text(input.description),itemType:text(input.itemType) as any,startTime:nullable(input.startTime),endTime:nullable(input.endTime),locationText:nullable(input.locationText),localGuideSlug:slug,status:'proposed',reservationNote:null,visibility:'participants',actor}));
    }
    let result:Record<string,unknown>;
    switch(input.action){
      case'updatePlan':result={revision:await updateBookingLinkedPlan({planId:plan.id,expectedRevision,title:text(input.title),description:text(input.description),actor})};break;
      case'addDay':result=await addPlanDay({planId:plan.id,expectedRevision,title:text(input.title),summary:text(input.summary),date:nullable(input.date),actor});break;
      case'updateDay':result={revision:await updatePlanDay({planId:plan.id,dayId:text(input.dayId),expectedRevision,title:text(input.title),summary:text(input.summary),date:nullable(input.date),actor})};break;
      case'removeDay':result={revision:await removePlanDay({planId:plan.id,dayId:text(input.dayId),expectedRevision,actor})};break;
      case'moveDay':if(!['up','down'].includes(text(input.direction)))throw new PlannerError('VALIDATION_ERROR','Move direction is invalid.');result={revision:await movePlanDay({planId:plan.id,dayId:text(input.dayId),expectedRevision,direction:text(input.direction) as 'up'|'down',actor})};break;
      case'addItem':{const slug=nullable(input.localGuideSlug);if(slug)await requirePlannerGuideEntry(slug);result=await addPlanItem({...item(input),planId:plan.id,dayId:text(input.dayId),expectedRevision,localGuideSlug:slug,actor});break}
      case'updateItem':result={revision:await updatePlanItem({...item(input),planId:plan.id,itemId:text(input.itemId),expectedRevision,actor})};break;
      case'removeItem':result={revision:await removePlanItem({planId:plan.id,itemId:text(input.itemId),expectedRevision,actor})};break;
      case'setGuideReference':{const slug=nullable(input.localGuideSlug);if(slug)await requirePlannerGuideEntry(slug);result={revision:await setPlanItemGuideReference({planId:plan.id,itemId:text(input.itemId),localGuideSlug:slug,expectedRevision,actor})};break}
      case'moveItem':if(!['up','down','end'].includes(text(input.position)))throw new PlannerError('VALIDATION_ERROR','Item position is invalid.');result={revision:await movePlanItem({planId:plan.id,itemId:text(input.itemId),targetDayId:text(input.targetDayId),expectedRevision,position:text(input.position) as any,actor})};break;
      default:return Response.json({error:'Planner action is invalid.'},{status:400});
    }
    return Response.json(result);
  }catch(error){
    if(error instanceof PlannerError){
      if(error.code==='STALE_REVISION'){
        const currentRevision=(await getHolidayPlan(plan.id))?.revision??plan.revision;
        console.warn('Participant planner revision conflict',{participantId:access.participantId,expectedRevision,currentRevision});
        return Response.json({error:error.message,code:error.code,currentRevision},{status:409});
      }
      return Response.json({error:error.message,code:error.code},{status:error.code==='NOT_FOUND'?404:400});
    }
    console.error('Participant planner action failed',{action:input.action,participantId:access.participantId});
    return Response.json({error:'The planner action could not be completed.'},{status:500});
  }
};
function item(input:Input){return{title:text(input.title),description:text(input.description),itemType:text(input.itemType)as any,startTime:nullable(input.startTime),endTime:nullable(input.endTime),locationText:nullable(input.locationText),status:text(input.status)as any,reservationNote:nullable(input.reservationNote),visibility:'participants'as const}}
