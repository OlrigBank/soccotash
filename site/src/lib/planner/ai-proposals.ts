import Ajv2020 from 'ajv/dist/2020.js';
import type { Pool } from 'pg';
import schema from './ai-proposal.schema.json' with { type: 'json' };
import { getPool } from '../booking/db.ts';
import { PlannerError, validateItemStatusTransition, type HolidayPlan } from './types.ts';
import type { BookerPlanActor, ParticipantPlanActor } from './types.ts';
import type { AiProposalDecision } from './ai-proposal-decisions.ts';

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
  for(const [operationIndex,operation] of (record.proposal.operations??[]).entries()){
    const indexed={...operation,operationIndex};
    if(operation.op==='add_item'){if(!days.has(operation.dayId))diff.conflicts.push({operation:indexed,reason:'Target day no longer exists.'});else diff.additions.push(indexed);continue}
    const existing=items.get(operation.itemId);if(!existing){diff.conflicts.push({operation:indexed,reason:'Target item no longer exists.'});continue}
    if(existing.item.visibility==='private'){diff.conflicts.push({operation:indexed,reason:'Private items cannot be changed by an AI proposal.'});continue}
    if(existing.item.status==='booked'){diff.conflicts.push({operation:indexed,reason:'Booked items require direct guest editing.'});continue}
    if(operation.op==='update_item')diff.changes.push({...indexed,before:existing.item});
    else if(operation.op==='remove_item')diff.removals.push({...indexed,before:existing.item});
    else if(operation.op==='move_item'){if(!days.has(operation.targetDayId))diff.conflicts.push({operation:indexed,reason:'Target day no longer exists.'});else if(operation.afterItemId&& !items.has(operation.afterItemId))diff.conflicts.push({operation:indexed,reason:'The requested ordering anchor no longer exists.'});else diff.moves.push({...indexed,before:existing.item,fromDayId:existing.day.id})}
  }return diff;
}

type DecisionActor=BookerPlanActor|ParticipantPlanActor;
export async function rejectAiProposal(input:{planId:string;proposalId:string;reason:string;actor:DecisionActor},database:Pick<Pool,'connect'>=getPool()):Promise<void>{
  const client=await database.connect();try{await client.query('BEGIN');
    const plan=await client.query<any>(`SELECT id,booking_id FROM holiday_plans WHERE public_id=$1::uuid AND plan_type='booking_linked' AND archived_at IS NULL FOR UPDATE`,[input.planId]);if(!plan.rowCount)throw new PlannerError('NOT_FOUND','Proposal not found.');
    const decider=input.actor.type==='booker'
      ?await client.query<any>(`SELECT id FROM plan_participants WHERE holiday_plan_id=$1 AND booking_id=$2 AND role='owner' AND revoked_at IS NULL`,[plan.rows[0].id,input.actor.bookingId])
      :input.actor.role==='editor'&&input.actor.planId===input.planId
        ?await client.query<any>(`SELECT id FROM plan_participants WHERE id=$1 AND holiday_plan_id=$2 AND role='editor' AND revoked_at IS NULL`,[input.actor.participantId,plan.rows[0].id])
        :{rowCount:0,rows:[]};if(!decider.rowCount)throw new PlannerError('NOT_FOUND','Proposal not found.');
    const decision:AiProposalDecision={action:'reject',reason:input.reason};const updated=await client.query(`UPDATE plan_ai_proposals SET status='rejected',decided_at=NOW(),decided_by_participant_id=$3,decision=$4::jsonb WHERE public_id=$1::uuid AND holiday_plan_id=$2 AND status='pending'`,[input.proposalId,plan.rows[0].id,decider.rows[0].id,JSON.stringify(decision)]);if(!updated.rowCount)throw new PlannerError('NOT_FOUND','Pending proposal not found.');await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
}

async function decisionContext(client:any,planId:string,expectedRevision:number,actor:DecisionActor){
  const plan=await client.query(`SELECT id,revision,booking_id FROM holiday_plans WHERE public_id=$1::uuid AND plan_type='booking_linked' AND archived_at IS NULL FOR UPDATE`,[planId]);
  if(!plan.rowCount)throw new PlannerError('NOT_FOUND','Proposal not found.');
  if(plan.rows[0].revision!==expectedRevision)throw new PlannerError('STALE_REVISION','The holiday plan has changed. Reload it before deciding.');
  const participant=actor.type==='booker'
    ?await client.query(`SELECT id FROM plan_participants WHERE holiday_plan_id=$1 AND booking_id=$2 AND role='owner' AND revoked_at IS NULL`,[plan.rows[0].id,actor.bookingId])
    :actor.role==='editor'&&actor.planId===planId
      ?await client.query(`SELECT id FROM plan_participants WHERE id=$1 AND holiday_plan_id=$2 AND role='editor' AND revoked_at IS NULL`,[actor.participantId,plan.rows[0].id])
      :{rowCount:0,rows:[]};
  if(!participant.rowCount)throw new PlannerError('NOT_FOUND','Proposal not found.');
  return{planInternalId:String(plan.rows[0].id),revision:plan.rows[0].revision,participantId:String(participant.rows[0].id)};
}

async function applyAcceptedOperation(client:any,planInternalId:string,operation:any){
  if(operation.op==='add_item'){
    const day=await client.query('SELECT id FROM plan_days WHERE public_id=$1::uuid AND holiday_plan_id=$2',[operation.dayId,planInternalId]);if(!day.rowCount)throw new PlannerError('VALIDATION_ERROR','A selected proposal targets a missing day.');
    await client.query(`INSERT INTO plan_items(plan_day_id,title,description,item_type,start_time,end_time,location_text,status,position,visibility) SELECT $1,$2,$3,$4,$5::time,$6::time,$7,$8,COALESCE(MAX(position),0)+10,'participants' FROM plan_items WHERE plan_day_id=$1`,[day.rows[0].id,operation.item.title,operation.item.description,operation.item.type,operation.item.startTime,operation.item.endTime,operation.item.location,operation.item.status]);return;
  }
  const existing=await client.query(`SELECT i.id,i.plan_day_id,i.visibility,i.status FROM plan_items i JOIN plan_days d ON d.id=i.plan_day_id WHERE i.public_id=$1::uuid AND d.holiday_plan_id=$2 FOR UPDATE`,[operation.itemId,planInternalId]);
  if(!existing.rowCount)throw new PlannerError('VALIDATION_ERROR','A selected proposal targets a missing item.');
  if(existing.rows[0].visibility==='private'||existing.rows[0].status==='booked')throw new PlannerError('VALIDATION_ERROR','Private or booked items cannot be changed by an AI proposal.');
  if(operation.op==='update_item'){const item=operation.changes;validateItemStatusTransition(existing.rows[0].status,item.status);await client.query(`UPDATE plan_items SET title=$2,description=$3,item_type=$4,start_time=$5::time,end_time=$6::time,location_text=$7,status=$8,updated_at=NOW() WHERE id=$1`,[existing.rows[0].id,item.title,item.description,item.type,item.startTime,item.endTime,item.location,item.status]);return}
  if(operation.op==='remove_item'){await client.query('DELETE FROM plan_items WHERE id=$1',[existing.rows[0].id]);return}
  if(operation.op==='move_item'){
    const day=await client.query('SELECT id FROM plan_days WHERE public_id=$1::uuid AND holiday_plan_id=$2',[operation.targetDayId,planInternalId]);if(!day.rowCount)throw new PlannerError('VALIDATION_ERROR','A selected move targets a missing day.');
    const ordered=await client.query('SELECT id,public_id::text FROM plan_items WHERE plan_day_id=$1 AND id<>$2 ORDER BY position FOR UPDATE',[day.rows[0].id,existing.rows[0].id]);
    let index=0;if(operation.afterItemId){const anchor=ordered.rows.findIndex((row:any)=>row.public_id===operation.afterItemId);if(anchor<0)throw new PlannerError('VALIDATION_ERROR','A selected move uses a missing ordering anchor.');index=anchor+1}
    const ids=ordered.rows.map((row:any)=>String(row.id));ids.splice(index,0,String(existing.rows[0].id));const high=1000000+ids.length*10;await client.query('UPDATE plan_items SET plan_day_id=$2,position=$3 WHERE id=$1',[existing.rows[0].id,day.rows[0].id,high]);
    for(let position=0;position<ids.length;position++)await client.query('UPDATE plan_items SET position=$2,updated_at=NOW() WHERE id=$1',[ids[position],(position+1)*10]);return;
  }
  throw new PlannerError('VALIDATION_ERROR','A selected proposal operation is unsupported.');
}

export async function acceptAiProposal(input:{planId:string;proposalId:string;expectedRevision:number;decision:Extract<AiProposalDecision,{action:'accept'}>;actor:DecisionActor},database:Pick<Pool,'connect'>=getPool()):Promise<number>{
  const client=await database.connect();try{await client.query('BEGIN');const context=await decisionContext(client,input.planId,input.expectedRevision,input.actor);
    const proposalResult=await client.query<any>(`SELECT id,proposal FROM plan_ai_proposals WHERE public_id=$1::uuid AND holiday_plan_id=$2 AND status='pending' FOR UPDATE`,[input.proposalId,context.planInternalId]);if(!proposalResult.rowCount)throw new PlannerError('NOT_FOUND','Pending proposal not found.');const proposal=proposalResult.rows[0].proposal;
    const operations=input.decision.selections.map(selection=>selection.replacement??proposal.operations[selection.operationIndex]);for(const operation of operations)await applyAcceptedOperation(client,context.planInternalId,operation);
    const status=input.decision.selections.length===proposal.operations.length?'accepted':'partially_accepted';await client.query(`UPDATE plan_ai_proposals SET status=$2,decided_at=NOW(),decided_by_participant_id=$3,decision=$4::jsonb WHERE id=$1`,[proposalResult.rows[0].id,status,context.participantId,JSON.stringify(input.decision)]);
    const revision=context.revision+1;await client.query('UPDATE holiday_plans SET revision=$2,updated_at=NOW() WHERE id=$1',[context.planInternalId,revision]);await client.query(`INSERT INTO plan_revisions(holiday_plan_id,revision,actor_type,participant_id,source,action,summary,changes) VALUES($1,$2,'external_ai',$3,'external_ai_proposal','ai_proposal_accepted',$4,$5::jsonb)`,[context.planInternalId,revision,context.participantId,status==='accepted'?'Accepted an external AI proposal.':'Partially accepted an external AI proposal.',JSON.stringify({proposalId:input.proposalId,acceptedOperationIndexes:input.decision.selections.map(x=>x.operationIndex),editedOperationIndexes:input.decision.selections.filter(x=>x.replacement).map(x=>x.operationIndex)})]);await client.query('COMMIT');return revision;
  }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
}
