import assert from 'node:assert/strict';import test from 'node:test';import {validateAiProposal} from '../../src/lib/planner/ai-proposals.ts';
const id='10000000-0000-4000-8000-000000000001';
const valid={format:'olrig-holiday-plan-proposal',version:'1.0',planId:id,sourceRevision:3,summary:'Add a walk',operations:[{op:'add_item',dayId:id,afterItemId:null,item:{title:'A walk',type:'activity',description:'Easy route',startTime:'10:00',endTime:'12:00',location:'Kendal',status:'proposed'}}]};
test('accepts the closed proposal contract',()=>assert.equal(validateAiProposal(valid).valid,true));
test('rejects protected, unknown and booked changes',()=>{
  for(const proposal of [{...valid,bookingId:id},{...valid,operations:[{...valid.operations[0],item:{...valid.operations[0].item,status:'booked'}}]},{...valid,operations:[{...valid.operations[0],item:{...valid.operations[0].item,reservationNote:'secret'}}]}])assert.equal(validateAiProposal(proposal).valid,false);
});
test('caps proposal operation counts',()=>assert.equal(validateAiProposal({...valid,operations:Array(101).fill(valid.operations[0])}).valid,false));
