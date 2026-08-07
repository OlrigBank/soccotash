import type { APIRoute } from 'astro';
import { authorizeAiCapabilityRequest } from '../../../../lib/planner/ai-capability-access.ts';
import { storeAiProposal,validateAiProposal } from '../../../../lib/planner/ai-proposals.ts';
export const prerender=false;
const headers={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow, noarchive'};
export const POST:APIRoute=async({params,request})=>{
  const length=Number(request.headers.get('content-length')||0);if(length>65536)return Response.json({error:'Proposal payload is too large.'},{status:413,headers});
  const authorization=await authorizeAiCapabilityRequest(String(params.token||''),'proposal');if(authorization.rateLimited)return Response.json({error:'AI collaboration rate limit exceeded.'},{status:429,headers:{...headers,'Retry-After':'3600'}});const access=authorization.access;if(!access)return Response.json({error:'AI collaboration not found.'},{status:404,headers});
  const value=await request.json().catch(()=>null);if(value===null||JSON.stringify(value).length>65536)return Response.json({error:'A valid proposal JSON payload under 64 KiB is required.'},{status:400,headers});
  const checked=validateAiProposal(value);if(!checked.valid)return Response.json({error:'Proposal validation failed.',details:checked.errors},{status:422,headers});
  if(checked.proposal.planId!==access.planId)return Response.json({error:'Proposal validation failed.',details:['/planId does not match this capability']},{status:422,headers});
  const stored=await storeAiProposal({capabilityId:access.capabilityId,planId:access.planId,proposal:checked.proposal});if(!stored)return Response.json({error:'AI collaboration not found.'},{status:404,headers});
  return Response.json(stored,{status:202,headers});
};
