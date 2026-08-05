import Ajv2020 from 'ajv/dist/2020.js';
import type { Pool } from 'pg';
import schema from './ai-proposal.schema.json' with { type: 'json' };
import { getPool } from '../booking/db.ts';
import type { HolidayPlan } from './types.ts';

const validate=new Ajv2020({allErrors:true,strict:true}).compile(schema);
export function validateAiProposal(value:unknown):{valid:true;proposal:Record<string,unknown>}|{valid:false;errors:string[]}{
  if(validate(value))return{valid:true,proposal:value as Record<string,unknown>};
  return{valid:false,errors:(validate.errors??[]).map(error=>`${error.instancePath||'/'} ${error.message}`)};
}
export async function storeAiProposal(input:{capabilityId:string;planId:string;proposal:Record<string,unknown>},database:Pick<Pool,'query'>=getPool()){
  const sourceRevision=Number(input.proposal.sourceRevision);
  const result=await database.query<any>(`WITH target AS (SELECT hp.id,hp.revision FROM holiday_plans hp WHERE hp.public_id=$1::uuid AND hp.archived_at IS NULL), inserted AS (INSERT INTO plan_ai_proposals(holiday_plan_id,capability_id,protocol_version,source_revision,received_revision,proposal) SELECT target.id,$2,'1.0',$3,target.revision,$4::jsonb FROM target RETURNING public_id::text,received_revision) SELECT public_id,received_revision FROM inserted`,[input.planId,input.capabilityId,sourceRevision,JSON.stringify(input.proposal)]);
  if(!result.rowCount)return null;
  await database.query('UPDATE plan_ai_capabilities SET last_proposal_at=NOW() WHERE id=$1',[input.capabilityId]);
  return{proposalId:result.rows[0].public_id,sourceRevision,receivedRevision:result.rows[0].received_revision,stale:sourceRevision!==result.rows[0].received_revision,status:'pending' as const};
}

export type AiProposalRecord={id:string;sourceRevision:number;receivedRevision:number;status:string;summary:string;submittedAt:string;proposal:Record<string,any>};
const mapProposal=(row:any):AiProposalRecord=>({id:row.public_id,sourceRevision:row.source_revision,receivedRevision:row.received_revision,status:row.status,summary:row.proposal.summary,submittedAt:new Date(row.submitted_at).toISOString(),proposal:row.proposal});
export async function listAiProposals(planId:string,database:Pick<Pool,'query'>=getPool()):Promise<AiProposalRecord[]>{const result=await database.query<any>(`SELECT p.public_id::text,p.source_revision,p.received_revision,p.status,p.proposal,p.submitted_at FROM plan_ai_proposals p JOIN holiday_plans hp ON hp.id=p.holiday_plan_id WHERE hp.public_id=$1::uuid ORDER BY p.submitted_at DESC`,[planId]);return result.rows.map(mapProposal)}
export async function getAiProposal(planId:string,proposalId:string,database:Pick<Pool,'query'>=getPool()):Promise<AiProposalRecord|null>{const result=await database.query<any>(`SELECT p.public_id::text,p.source_revision,p.received_revision,p.status,p.proposal,p.submitted_at FROM plan_ai_proposals p JOIN holiday_plans hp ON hp.id=p.holiday_plan_id WHERE hp.public_id=$1::uuid AND p.public_id=$2::uuid`,[planId,proposalId]);return result.rowCount?mapProposal(result.rows[0]):null}

export type AiProposalDiff={additions:any[];changes:any[];moves:any[];removals:any[];conflicts:Array<{operation:any;reason:string}>;stale:boolean};
export function compareAiProposal(plan:HolidayPlan,record:AiProposalRecord):AiProposalDiff{
  const diff:AiProposalDiff={additions:[],changes:[],moves:[],removals:[],conflicts:[],stale:record.sourceRevision!==plan.revision};
  const days=new Map(plan.days.map(day=>[day.id,day]));const items=new Map(plan.days.flatMap(day=>day.items.map(item=>[item.id,{item,day}])));
  for(const operation of record.proposal.operations??[]){
    if(operation.op==='add_item'){if(!days.has(operation.dayId))diff.conflicts.push({operation,reason:'Target day no longer exists.'});else diff.additions.push(operation);continue}
    const existing=items.get(operation.itemId);if(!existing){diff.conflicts.push({operation,reason:'Target item no longer exists.'});continue}
    if(existing.item.visibility==='private'){diff.conflicts.push({operation,reason:'Private items cannot be changed by an AI proposal.'});continue}
    if(existing.item.status==='booked'){diff.conflicts.push({operation,reason:'Booked items require direct guest editing.'});continue}
    if(operation.op==='update_item')diff.changes.push({...operation,before:existing.item});
    else if(operation.op==='remove_item')diff.removals.push({...operation,before:existing.item});
    else if(operation.op==='move_item'){if(!days.has(operation.targetDayId))diff.conflicts.push({operation,reason:'Target day no longer exists.'});else if(operation.afterItemId&& !items.has(operation.afterItemId))diff.conflicts.push({operation,reason:'The requested ordering anchor no longer exists.'});else diff.moves.push({...operation,before:existing.item,fromDayId:existing.day.id})}
  }return diff;
}
