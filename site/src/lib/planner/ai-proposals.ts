import Ajv2020 from 'ajv/dist/2020.js';
import type { Pool } from 'pg';
import schema from './ai-proposal.schema.json' with { type: 'json' };
import { getPool } from '../booking/db.ts';

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
