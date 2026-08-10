import type { APIRoute } from 'astro';
import QRCode from 'qrcode';
import { isSameOrigin } from '../../../../lib/admin/auth.ts';
import { resolveGuestPlanSession } from '../../../../lib/planner/guest-password.ts';
import {
  addPlanCandidateActivity, addPlanDay, addPlanGuideCandidates, addPlanItem, createPlanAiCapability, getHolidayPlan, movePlanCandidateActivity, movePlanDay, movePlanItem, offerGuideContribution, placePlanItem, removePlanCandidateActivity, removePlanDay,
  removePlanItem, returnPlanItemToCandidates, revokePlanAiCapability, schedulePlanCandidateActivity, setPlanItemGuideReference, updateBookingLinkedPlan, updatePlanDay, updatePlanItem, withdrawGuideContribution,
} from '../../../../lib/planner/repository.ts';
import { PlannerError } from '../../../../lib/planner/types.ts';
import { acceptAiProposal, getAiProposal, rejectAiProposal } from '../../../../lib/planner/ai-proposals.ts';
import { validateAiProposalDecision } from '../../../../lib/planner/ai-proposal-decisions.ts';
import { listPublishedLocalGuideCategories } from '../../../../lib/local-guide/workspace.ts';
import { getPlannerGuideEntries } from '../../../../lib/planner/local-guide.ts';

export const prerender=false;
type Input=Record<string,unknown>;
const text=(value:unknown)=>String(value??'');
const nullable=(value:unknown)=>text(value).trim()||null;

export const POST:APIRoute=async({params,request,cookies})=>{
  if(!isSameOrigin(request))return Response.json({error:'Cross-site request forbidden.'},{status:403});
  const access=await resolveGuestPlanSession(text(params.token),cookies,true);
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
      return Response.json(await addPlanItem({planId:plan.id,dayId:text(input.dayId),expectedRevision,title:text(input.title),description:text(input.description),itemType:text(input.itemType) as any,startTime:nullable(input.startTime),endTime:nullable(input.endTime),locationText:nullable(input.locationText),localGuideEntryId:nullable(input.localGuideEntryId),status:'proposed',reservationNote:null,visibility:'participants',actor}));
    }
    if(input.action==='createAiCapability'){const created=await createPlanAiCapability({planId:plan.id,expectedRevision,expiresHours:Number(input.expiresHours),actor});const url=new URL(`/planner/ai/${created.token}/`,request.url).toString();return Response.json({...created,url,qrDataUrl:await QRCode.toDataURL(url,{errorCorrectionLevel:'M',margin:2,width:320})})}
    if(input.action==='revokeAiCapability')return Response.json({revision:await revokePlanAiCapability({planId:plan.id,capabilityId:text(input.capabilityId),expectedRevision,actor})});
    if(input.action==='acceptAiProposal'||input.action==='rejectAiProposal'){const proposal=await getAiProposal(plan.id,text(input.proposalId));if(!proposal)throw new PlannerError('NOT_FOUND','Pending proposal not found.');const checked=validateAiProposalDecision(input.action==='rejectAiProposal'?{action:'reject',reason:input.reason}:{action:'accept',selections:input.selections},proposal.proposal);if(!checked.valid)throw new PlannerError('VALIDATION_ERROR',checked.errors.join(' '));if(checked.decision.action==='reject'){await rejectAiProposal({planId:plan.id,proposalId:proposal.id,reason:checked.decision.reason,actor});return Response.json({revision:plan.revision,status:'rejected'})}return Response.json({revision:await acceptAiProposal({planId:plan.id,proposalId:proposal.id,expectedRevision,decision:checked.decision,actor}),status:'accepted'})}
    let result:Record<string,unknown>;
    switch(input.action){
      case'updatePlan':result={revision:await updateBookingLinkedPlan({planId:plan.id,expectedRevision,title:text(input.title),description:text(input.description),actor})};break;
      case'addDay':result=await addPlanDay({planId:plan.id,expectedRevision,title:text(input.title),summary:text(input.summary),date:nullable(input.date),actor});break;
      case'updateDay':result={revision:await updatePlanDay({planId:plan.id,dayId:text(input.dayId),expectedRevision,title:text(input.title),summary:text(input.summary),date:nullable(input.date),actor})};break;
      case'removeDay':result={revision:await removePlanDay({planId:plan.id,dayId:text(input.dayId),expectedRevision,actor})};break;
      case'moveDay':if(!['up','down'].includes(text(input.direction)))throw new PlannerError('VALIDATION_ERROR','Move direction is invalid.');result={revision:await movePlanDay({planId:plan.id,dayId:text(input.dayId),expectedRevision,direction:text(input.direction) as 'up'|'down',actor})};break;
      case'addItem':{result=await addPlanItem({...item(input),planId:plan.id,dayId:text(input.dayId),expectedRevision,localGuideEntryId:nullable(input.localGuideEntryId),actor});break}
      case'addCandidate':result=await addPlanCandidateActivity({planId:plan.id,expectedRevision,title:text(input.title),description:text(input.description),sourceUrl:nullable(input.sourceUrl),localGuideEntryId:nullable(input.localGuideEntryId),retainForGuide:input.retainForGuide===true,actor});break;
      case'addGuideCategoryCandidates':{const categoryId=text(input.categoryId);const categories=await listPublishedLocalGuideCategories();if(!categories.some(item=>item.id===categoryId)||categoryId==='home')throw new PlannerError('VALIDATION_ERROR','The selected Local Guide category is unavailable.');const descendants:string[]=[];const visit=(parent:string)=>{for(const item of categories.filter(candidate=>candidate.parent===parent)){descendants.push(item.id);visit(item.id)}};visit(categoryId);const ids=new Set([categoryId,...descendants]);result=await addPlanGuideCandidates({planId:plan.id,expectedRevision,localGuideEntryIds:(await getPlannerGuideEntries()).filter(g=>ids.has(g.category)).map(g=>g.id),actor});break}
      case'moveCandidate':if(!['up','down'].includes(text(input.direction)))throw new PlannerError('VALIDATION_ERROR','Candidate move direction is invalid.');result={revision:await movePlanCandidateActivity({planId:plan.id,candidateId:text(input.candidateId),expectedRevision,direction:text(input.direction) as 'up'|'down',actor})};break;
      case'removeCandidate':result={revision:await removePlanCandidateActivity({planId:plan.id,candidateId:text(input.candidateId),expectedRevision,actor})};break;
      case'scheduleCandidate':result=await schedulePlanCandidateActivity({planId:plan.id,candidateId:text(input.candidateId),dayId:text(input.dayId),expectedRevision,actor});break;
      case'returnItemToCandidates':result=await returnPlanItemToCandidates({planId:plan.id,itemId:text(input.itemId),expectedRevision,actor});break;
      case'placeItem':if(!['before','after'].includes(text(input.placement)))throw new PlannerError('VALIDATION_ERROR','Plan item placement is invalid.');result={revision:await placePlanItem({planId:plan.id,itemId:text(input.itemId),relativeItemId:text(input.relativeItemId),placement:text(input.placement) as 'before'|'after',expectedRevision,actor})};break;
      case'updateItem':result={revision:await updatePlanItem({...item(input),planId:plan.id,itemId:text(input.itemId),expectedRevision,actor})};break;
      case'removeItem':result={revision:await removePlanItem({planId:plan.id,itemId:text(input.itemId),expectedRevision,actor})};break;
      case'setGuideReference':{result={revision:await setPlanItemGuideReference({planId:plan.id,itemId:text(input.itemId),localGuideEntryId:nullable(input.localGuideEntryId),expectedRevision,actor})};break}
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
function item(input:Input){return{title:text(input.title),description:text(input.description),itemType:text(input.itemType)as any,startTime:nullable(input.startTime),endTime:nullable(input.endTime),locationText:nullable(input.locationText),sourceUrl:nullable(input.sourceUrl),status:text(input.status)as any,reservationNote:nullable(input.reservationNote),visibility:'participants'as const}}
