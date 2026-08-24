import type { APIRoute } from 'astro';
import { audit, isSameOrigin } from '../../../../lib/admin/auth';
import { getProperty } from '../../../../lib/booking/config';
import { assessOccupancy, validateAssessmentInput } from '../../../../lib/occupancy/evaluator';
import { createOccupancyPolicy, duplicateOccupancyPolicy, getOccupancyPolicy, publishOccupancyPolicy, upsertOccupancyRule } from '../../../../lib/occupancy/repository';
import { OCCUPANCY_SUBJECTS, type OccupancyExceedOutcome, type OccupancySubject } from '../../../../lib/occupancy/types';

export const prerender = false;
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const text=(value:unknown,max=160)=>String(value??'').trim().slice(0,max);
const integer=(value:unknown)=>Number.isFinite(Number(value))?Math.round(Number(value)):NaN;

function errorResponse(error:unknown):Response{
  const code=error instanceof Error?error.message:'UNKNOWN';
  const messages:Record<string,string>={POLICY_NOT_FOUND:'Occupancy policy not found.',DRAFT_POLICY_NOT_FOUND:'Only a draft policy can be changed.',OCCUPANCY_POLICY_INCOMPLETE:'Define all five occupancy rules before publishing.',INVALID_OCCUPANCY_RULE:'Enter a valid non-negative threshold and outcome.',INVALID_OCCUPANCY_INPUT:'Enter non-negative whole-number counts and at least one adult.',INVALID_SERVICE_ANIMAL_COUNT:'Service animals cannot exceed the total number of pets.'};
  if(messages[code])return Response.json({error:messages[code]},{status:400});console.error(error);return Response.json({error:'The occupancy operation could not be completed.'},{status:500});
}

export const POST:APIRoute=async({request,locals})=>{
  if(!locals.adminUser)return Response.json({error:'Unauthorized.'},{status:401});
  if(!isSameOrigin(request))return Response.json({error:'Cross-origin request rejected.'},{status:403});
  if(!request.headers.get('content-type')?.includes('application/json'))return Response.json({error:'JSON request required.'},{status:415});
  try{
    const input=object(await request.json());const action=text(input.action,40);const userId=locals.adminUser.id;
    if(action==='createPolicy'){
      const propertyId=text(input.propertyId,80);const property=getProperty(propertyId);if(!property)return Response.json({error:'Unknown stay arrangement.'},{status:400});
      const policy=await createOccupancyPolicy(propertyId,text(input.name)||`${property.name} — occupancy draft`,userId);await audit(userId,'occupancy.policy.created',{policyId:policy.id,propertyId});return Response.json({policy},{status:201});
    }
    if(action==='duplicatePolicy'){
      const sourcePolicyId=text(input.policyId,30);const policy=await duplicateOccupancyPolicy(sourcePolicyId,userId);await audit(userId,'occupancy.policy.duplicated',{sourcePolicyId,policyId:policy.id});return Response.json({policy},{status:201});
    }
    if(action==='updateRule'){
      const subject=text(input.subject,30) as OccupancySubject;const exceedOutcome=text(input.exceedOutcome,40) as OccupancyExceedOutcome;if(!OCCUPANCY_SUBJECTS.includes(subject))throw new Error('INVALID_OCCUPANCY_RULE');
      const rule=await upsertOccupancyRule({policyId:text(input.policyId,30),subject,maximumStandardCount:integer(input.maximumStandardCount),exceedOutcome,adminUserId:userId});await audit(userId,'occupancy.rule.updated',{policyId:rule.policyId,subject});return Response.json({rule});
    }
    if(action==='publishPolicy'){
      const policyId=text(input.policyId,30);await publishOccupancyPolicy(policyId,userId);await audit(userId,'occupancy.policy.published',{policyId});return Response.json({ok:true});
    }
    if(action==='simulate'){
      const policy=await getOccupancyPolicy(text(input.policyId,30));if(!policy)return Response.json({error:'Occupancy policy not found.'},{status:404});const raw=object(input.party);
      const party=validateAssessmentInput({adults:integer(raw.adults),children:integer(raw.children),infants:integer(raw.infants),pets:integer(raw.pets),serviceAnimals:integer(raw.serviceAnimals)});
      return Response.json({policy:{id:policy.id,name:policy.name,status:policy.status},party,result:assessOccupancy(policy,party)},{headers:{'cache-control':'no-store'}});
    }
    return Response.json({error:'Unknown occupancy action.'},{status:400});
  }catch(error){return errorResponse(error);}
};
