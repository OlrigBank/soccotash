import type { APIRoute } from 'astro';
import { isSameOrigin } from '../../../../lib/admin/auth.ts';
import { getPlannerGuideEntries, requirePlannerGuideEntry } from '../../../../lib/planner/local-guide.ts';
import { moderateGuideContribution } from '../../../../lib/planner/repository.ts';
import { PlannerError, validateGuideSlug } from '../../../../lib/planner/types.ts';

export const prerender=false;
type Input=Record<string,unknown>;
const text=(value:unknown)=>String(value??'');
const nullable=(value:unknown)=>text(value).trim()||null;

export const POST:APIRoute=async({request,locals})=>{
  if(!isSameOrigin(request))return Response.json({error:'Cross-site request forbidden.'},{status:403});
  const input=await request.json().catch(()=>null) as Input|null;
  if(!input)return Response.json({error:'A valid JSON request is required.'},{status:400});
  const actor={type:'administrator' as const,adminUserId:locals.adminUser!.id};
  try{
    const decision=text(input.decision);
    if(!['accept','reject'].includes(decision))throw new PlannerError('VALIDATION_ERROR','Moderation decision is invalid.');
    const resultType=nullable(input.resultType) as 'new_entry_draft'|'suggested_update'|null;
    const resultGuideSlug=nullable(input.resultGuideSlug);
    if(decision==='accept'){
      const slug=validateGuideSlug(resultGuideSlug);
      if(resultType==='suggested_update')await requirePlannerGuideEntry(slug!);
      else if(resultType==='new_entry_draft'){
        if((await getPlannerGuideEntries()).some(entry=>entry.slug===slug))throw new PlannerError('VALIDATION_ERROR','That Local Guide slug already exists.');
      }else throw new PlannerError('VALIDATION_ERROR','Accepted contributions need a valid result type.');
    }
    return Response.json(await moderateGuideContribution({candidateId:text(input.candidateId),decision:decision as 'accept'|'reject',reviewedTitle:text(input.reviewedTitle),reviewedDescription:text(input.reviewedDescription),reviewedLocationText:nullable(input.reviewedLocationText),resultType:resultType??undefined,resultGuideSlug:resultGuideSlug??undefined,moderationNotes:text(input.moderationNotes),actor}));
  }catch(error){
    if(error instanceof PlannerError)return Response.json({error:error.message,code:error.code},{status:error.code==='NOT_FOUND'?404:400});
    console.error('Guide contribution moderation failed',{candidateId:text(input.candidateId),decision:text(input.decision),adminUserId:actor.adminUserId});
    return Response.json({error:'The moderation decision could not be completed.'},{status:500});
  }
};
