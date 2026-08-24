import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validateOccupancyDetails } from '../../src/lib/booking/occupancy-details.ts';

const counts={adults:4,children:2,infants:1,pets:3};
test('optional names reconcile with authoritative counts without contact details',()=>{
  const result=validateOccupancyDetails({occupants:[{preferredName:'Alex',category:'adult'},{preferredName:'Sam',category:'child'}],pets:[{species:'dog',breed:'Collie',size:'medium'},{species:'cat',serviceAnimal:true},{species:'other',otherSpecies:'Rabbit'}]},counts);
  assert.equal(result.occupants.length,2);assert.deepEqual(result.pets.map(pet=>pet.species),['dog','cat','other']);assert.equal(result.pets[1].serviceAnimal,true);
  assert.ok(result.occupants.every(item=>!('email' in item)&&!('telephone' in item)&&!('dateOfBirth' in item)));
});
test('unnamed people remain valid but category and pet mismatches are rejected',()=>{
  assert.equal(validateOccupancyDetails({occupants:[],pets:[{species:'dog'},{species:'cat'},{species:'other',otherSpecies:'Rabbit'}]},counts).occupants.length,0);
  assert.throws(()=>validateOccupancyDetails({occupants:[{preferredName:'A',category:'infant'},{preferredName:'B',category:'infant'}],pets:[{species:'dog'},{species:'cat'},{species:'dog'}]},counts),/OCCUPANT_COUNT_MISMATCH/);
  assert.throws(()=>validateOccupancyDetails({occupants:[],pets:[{species:'dog'}]},counts),/PET_COUNT_MISMATCH/);
  assert.throws(()=>validateOccupancyDetails({occupants:[],pets:[{species:'dog'},{species:'cat'},{species:'other'}]},counts),/INVALID_PET/);
});
test('migration separates descriptive records from access credentials',async()=>{
  const migration=await readFile(new URL('../../db/049_optional_occupants_and_pets.sql',import.meta.url),'utf8');
  assert.match(migration,/booking_occupants/);assert.match(migration,/booking_pets/);assert.match(migration,/service_animal BOOLEAN/);
  assert.doesNotMatch(migration,/email|telephone|password|access_token/i);
});
