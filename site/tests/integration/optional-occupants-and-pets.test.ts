import assert from 'node:assert/strict';import crypto from 'node:crypto';import {readdir,readFile} from 'node:fs/promises';import test from 'node:test';import pg from 'pg';
const {Pool}=pg;const databaseUrl=process.env.TEST_DATABASE_URL||process.env.DATABASE_URL;
const quote=(value:string)=>`"${value.replaceAll('"','""')}"`;
test('occupant and pet tables enforce booking ownership and structured details',async()=>{
  assert.ok(databaseUrl,'Set TEST_DATABASE_URL or DATABASE_URL.');const schema=`occupancy_details_${process.pid}_${crypto.randomBytes(5).toString('hex')}`;const control=new Pool({connectionString:databaseUrl,max:1});const url=new URL(databaseUrl!);url.searchParams.set('options',`-c search_path=${schema},public`);const db=new Pool({connectionString:url.toString(),max:1});
  try{await control.query(`CREATE SCHEMA ${quote(schema)}`);const directory=new URL('../../db/',import.meta.url);for(const file of (await readdir(directory)).filter(name=>name.endsWith('.sql')).sort())await db.query(await readFile(new URL(file,directory),'utf8'));
    const booking=(await db.query(`INSERT INTO provisional_bookings(property_id,arrival,departure,adults,children,infants,pets,guest_name,guest_email) VALUES('olrig-bank',CURRENT_DATE+20,CURRENT_DATE+22,2,1,0,2,'Booker','') RETURNING id`)).rows[0];
    await db.query(`INSERT INTO booking_occupants(provisional_booking_id,preferred_name,category,position) VALUES($1,'Optional child','child',0)`,[booking.id]);await db.query(`INSERT INTO booking_pets(provisional_booking_id,species,breed,size,service_animal,position) VALUES($1,'dog','Collie','medium',FALSE,0),($1,'cat',NULL,NULL,TRUE,1)`,[booking.id]);
    assert.deepEqual((await db.query(`SELECT species,service_animal FROM booking_pets WHERE provisional_booking_id=$1 ORDER BY position`,[booking.id])).rows,[{species:'dog',service_animal:false},{species:'cat',service_animal:true}]);
    await assert.rejects(db.query(`INSERT INTO booking_pets(provisional_booking_id,species,position) VALUES($1,'rabbit',2)`,[booking.id]),/booking_pets_species_check/);
  }finally{await db.end();await control.query(`DROP SCHEMA IF EXISTS ${quote(schema)} CASCADE`);await control.end();}
});
