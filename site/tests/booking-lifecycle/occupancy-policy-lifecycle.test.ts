import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { assessOccupancy } from '../../src/lib/occupancy/evaluator.ts';
import type { OccupancyPolicy } from '../../src/lib/occupancy/types.ts';

const policy: OccupancyPolicy = {
  id:'1',propertyId:'main-house',name:'Test',status:'draft',version:1,basedOnPolicyId:null,
  publishedAt:null,createdAt:new Date(0).toISOString(),updatedAt:new Date(0).toISOString(),
  rules:[
    ['adults',8,'bespoke'],['children',2,'bespoke'],['infants',2,'host_decision_required'],
    ['pets',2,'bespoke'],['service_animals',0,'host_decision_required'],
  ].map(([subject,maximumStandardCount,exceedOutcome],index)=>({id:String(index+1),policyId:'1',subject,maximumStandardCount,exceedOutcome})) as OccupancyPolicy['rules'],
};

test('occupancy evaluator returns stable standard, bespoke and host-decision outcomes',()=>{
  assert.deepEqual(assessOccupancy(policy,{adults:8,children:2,infants:1,pets:0,serviceAnimals:0}),{outcome:'standard',reasons:[]});
  const bespoke=assessOccupancy(policy,{adults:9,children:0,infants:0,pets:0,serviceAnimals:0});
  assert.equal(bespoke.outcome,'bespoke');assert.equal(bespoke.reasons[0].code,'adults_standard_threshold_exceeded');
  const review=assessOccupancy(policy,{adults:2,children:0,infants:3,pets:1,serviceAnimals:1});
  assert.equal(review.outcome,'host_decision_required');assert.deepEqual(review.reasons.map(item=>item.subject),['infants','service_animals']);
});

test('occupancy evaluator rejects invalid parties and service-animal totals',()=>{
  assert.throws(()=>assessOccupancy(policy,{adults:0,children:0,infants:0,pets:0,serviceAnimals:0}),/INVALID_OCCUPANCY_INPUT/);
  assert.throws(()=>assessOccupancy(policy,{adults:1,children:0,infants:0,pets:0,serviceAnimals:1}),/INVALID_SERVICE_ANIMAL_COUNT/);
});

test('occupancy administration remains authenticated, same-origin and closed-rule based',async()=>{
  const [migration,api,page]=await Promise.all([
    readFile(new URL('../../db/047_occupancy_policy_lifecycle.sql',import.meta.url),'utf8'),
    readFile(new URL('../../src/pages/api/admin/occupancy/action.ts',import.meta.url),'utf8'),
    readFile(new URL('../../src/pages/admin/occupancy/index.astro',import.meta.url),'utf8'),
  ]);
  assert.match(migration,/status IN \('draft', 'published', 'archived'\)/);
  assert.match(migration,/occupancy_policies_one_published_per_property_idx/);
  assert.match(migration,/subject IN \('adults', 'children', 'infants', 'pets', 'service_animals'\)/);
  assert.match(api,/locals\.adminUser/);assert.match(api,/isSameOrigin\(request\)/);
  assert.match(page,/Model a party/);assert.match(page,/Publish policy/);
  assert.doesNotMatch(`${migration}\n${api}`,/eval\(|new Function/);
});
