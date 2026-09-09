import { test, expect } from '@playwright/test';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { createReservationFixture } from '../support/reservation-fixture.mjs';

test('customer pet edits preserve names, reject invalid pets and retain administration editing', async ({page, context, baseURL}) => {
  const fixture = await createReservationFixture();
  const root = `/booking/manage/${fixture.booking.reference}/`;
  const adminEmail = `e13-pets-${randomUUID()}@example.test`;
  const occupants = async () => (await fixture.database.query('SELECT * FROM booking_occupants WHERE provisional_booking_id=$1 ORDER BY position',[fixture.booking.id])).rows;
  const pets = async () => (await fixture.database.query('SELECT * FROM booking_pets WHERE provisional_booking_id=$1 ORDER BY position',[fixture.booking.id])).rows;
  try {
    await context.addCookies([{name:'olrig_booker_session',value:fixture.token,url:baseURL!,httpOnly:true,sameSite:'Lax'}]);
    await page.goto(root);
    await expect(page.getByRole('region',{name:'Pet details',exact:true})).toHaveCount(0);
    await expect(page.getByRole('button',{name:'Save occupants and pets'})).toHaveCount(0);
    await expect(page.getByText('Optional occupant names')).toHaveCount(0);
    await fixture.database.query('UPDATE provisional_bookings SET pets=2,children=1 WHERE id=$1',[fixture.booking.id]);
    await fixture.database.query("INSERT INTO booking_occupants(provisional_booking_id,preferred_name,category,position) VALUES($1,'Existing adult','adult',0),($1,'Existing child','child',1)",[fixture.booking.id]);
    await fixture.database.query("INSERT INTO booking_pets(provisional_booking_id,species,breed,position) VALUES($1,'dog','Collie',0),($1,'cat','British Shorthair',1)",[fixture.booking.id]);
    const originalOccupants = await occupants();const originalPets = await pets();
    await page.reload();
    const region = page.getByRole('region',{name:'Pet details',exact:true});
    await expect(region).toBeVisible();
    await expect(page.getByText('Optional occupant names')).toHaveCount(0);
    await expect(page.getByText('Existing adult',{exact:true})).toHaveCount(0);
    const first = region.locator('.booking-pet-detail').nth(0);
    await first.getByRole('combobox',{name:'Species',exact:true}).selectOption('other');
    await first.getByLabel('Breed (optional)').fill('Retained draft');
    await first.getByLabel('Service animal').check();
    await region.getByRole('button',{name:'Save pet details'}).click();
    await expect(region.getByRole('alert')).toContainText('Check the pet species');
    await expect(first.getByRole('combobox',{name:'Species',exact:true})).toHaveValue('other');
    await expect(first.getByLabel('Breed (optional)')).toHaveValue('Retained draft');
    await expect(first.getByLabel('Service animal')).toBeChecked();
    expect(await occupants()).toEqual(originalOccupants);expect(await pets()).toEqual(originalPets);
    await first.getByLabel('Other species',{exact:true}).fill('Rabbit');
    await region.getByRole('button',{name:'Save pet details'}).click();
    await expect(region.getByRole('status')).toHaveText('Pet details were saved.');
    expect(await occupants()).toEqual(originalOccupants);
    expect((await pets()).map(pet=>[pet.species,pet.other_species,pet.service_animal])).toEqual([['other','Rabbit',true],['cat',null,false]]);
    await page.reload();await expect(first.getByLabel('Other species',{exact:true})).toHaveValue('Rabbit');
    // Older forms and crafted customer fields cannot replace the administrator's names.
    const legacy = await page.request.post(root,{headers:{origin:baseURL!},form:{action:'save-occupancy-details','occupant-adult-0':'Overwrite attempt','pet-species-0':'dog','pet-species-1':'cat'}});
    expect(legacy.status()).toBe(200);expect(await occupants()).toEqual(originalOccupants);
    const administrator = (await fixture.database.query("INSERT INTO admin_users(email,display_name,password_hash) VALUES($1,'E13 pet fixture','unusable-fixture-hash') RETURNING id",[adminEmail])).rows[0];
    const token=randomBytes(32).toString('base64url');
    await fixture.database.query("INSERT INTO admin_sessions(admin_user_id,token_hash,expires_at) VALUES($1,$2,NOW()+INTERVAL '10 minutes')",[administrator.id,createHash('sha256').update(token).digest('hex')]);
    await context.addCookies([{name:'olrig_admin_session',value:token,url:baseURL!,httpOnly:true,sameSite:'Lax'}]);
    await page.goto(`/admin/bookings/${fixture.booking.reference}/reservation/`);
    await expect(page.getByLabel('Adult 2',{exact:true})).toHaveValue('Existing adult');
    await page.getByLabel('Adult 2',{exact:true}).fill('Updated by administrator');
    // The existing narrow admin reservation drawer overlaps this button for pointer clicks.
    await page.getByRole('button',{name:'Save occupants and pets'}).press('Enter');
    await expect(page.getByLabel('Adult 2',{exact:true})).toHaveValue('Updated by administrator');
    const administratorOccupants=await occupants();expect(administratorOccupants[0].preferred_name).toBe('Updated by administrator');
    await page.goto(`${root}reservation/`);
    await region.getByRole('button',{name:'Save pet details'}).click();
    expect(await occupants()).toEqual(administratorOccupants);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth)).toBe(false);
  } finally {
    await fixture.database.query('DELETE FROM admin_users WHERE email=$1',[adminEmail]);
    await fixture.cleanup();
  }
});
