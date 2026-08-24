import type pg from 'pg';
import { getPool } from './db.ts';

export type OccupantCategory = 'adult' | 'child' | 'infant';
export type PetSpecies = 'dog' | 'cat' | 'other';
export type PetSize = 'small' | 'medium' | 'large';
export type BookingOccupant = { id: string; preferredName: string; category: OccupantCategory };
export type BookingPet = { id: string; species: PetSpecies; otherSpecies: string | null; breed: string | null; size: PetSize | null; serviceAnimal: boolean };
export type OccupancyDetails = { occupants: BookingOccupant[]; pets: BookingPet[] };
export type OccupancyDetailsInput = {
  occupants: Array<{ preferredName: unknown; category: unknown }>;
  pets: Array<{ species: unknown; otherSpecies?: unknown; breed?: unknown; size?: unknown; serviceAnimal?: unknown }>;
};

export function occupancyDetailsFromForm(form: FormData, counts: { adults: number; children: number; infants: number; pets: number }): OccupancyDetailsInput {
  const occupants: OccupancyDetailsInput['occupants'] = [];
  for (const [category, count] of [['adult', Math.max(0, counts.adults - 1)], ['child', counts.children], ['infant', counts.infants]] as const) {
    for (let index = 0; index < count; index += 1) {
      const preferredName = clean(form.get(`occupant-${category}-${index}`), 120);
      if (preferredName) occupants.push({ preferredName, category });
    }
  }
  const pets: OccupancyDetailsInput['pets'] = [];
  for (let index = 0; index < counts.pets; index += 1) pets.push({ species: form.get(`pet-species-${index}`), otherSpecies: form.get(`pet-other-${index}`), breed: form.get(`pet-breed-${index}`), size: form.get(`pet-size-${index}`), serviceAnimal: form.get(`pet-service-${index}`) });
  return { occupants, pets };
}

const clean = (value: unknown, maximum: number) => String(value ?? '').trim().slice(0, maximum);

export function validateOccupancyDetails(input: OccupancyDetailsInput, counts: { adults: number; children: number; infants: number; pets: number }) {
  const occupants = input.occupants.map((item) => ({
    preferredName: clean(item.preferredName, 120), category: String(item.category) as OccupantCategory,
  }));
  if (occupants.some((item) => !item.preferredName || !['adult', 'child', 'infant'].includes(item.category))) throw new Error('INVALID_OCCUPANT');
  const named = { adult: 0, child: 0, infant: 0 };
  occupants.forEach((item) => { named[item.category] += 1; });
  if (named.adult > counts.adults || named.child > counts.children || named.infant > counts.infants) throw new Error('OCCUPANT_COUNT_MISMATCH');

  const pets = input.pets.map((item) => {
    const species = String(item.species) as PetSpecies;
    const otherSpecies = clean(item.otherSpecies, 80) || null;
    const breed = clean(item.breed, 80) || null;
    const size = clean(item.size, 20) as PetSize | '';
    if (!['dog', 'cat', 'other'].includes(species) || (species === 'other' && !otherSpecies) || (species !== 'other' && otherSpecies) || (size && !['small', 'medium', 'large'].includes(size))) throw new Error('INVALID_PET');
    return { species, otherSpecies, breed, size: size || null, serviceAnimal: item.serviceAnimal === true || item.serviceAnimal === 'yes' || item.serviceAnimal === 'on' };
  });
  if (pets.length !== counts.pets) throw new Error('PET_COUNT_MISMATCH');
  return { occupants, pets };
}

export async function getOccupancyDetails(bookingReference: string, database: pg.Pool | pg.PoolClient = getPool()): Promise<OccupancyDetails> {
  const [occupants, pets] = await Promise.all([
    database.query(`SELECT bo.public_id::text AS id, bo.preferred_name AS "preferredName", bo.category FROM booking_occupants bo JOIN provisional_bookings pb ON pb.id=bo.provisional_booking_id WHERE pb.public_id=$1::uuid ORDER BY bo.position`, [bookingReference]),
    database.query(`SELECT bp.public_id::text AS id, bp.species, bp.other_species AS "otherSpecies", bp.breed, bp.size, bp.service_animal AS "serviceAnimal" FROM booking_pets bp JOIN provisional_bookings pb ON pb.id=bp.provisional_booking_id WHERE pb.public_id=$1::uuid ORDER BY bp.position`, [bookingReference]),
  ]);
  return { occupants: occupants.rows, pets: pets.rows };
}

export async function replaceOccupancyDetails(bookingReference: string, input: OccupancyDetailsInput, actor: 'customer' | 'administrator', database: pg.Pool = getPool()): Promise<OccupancyDetails> {
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    const selected = await client.query(`SELECT id,adults,children,infants,pets FROM provisional_bookings WHERE public_id=$1::uuid AND deletion_requested_at IS NULL FOR UPDATE`, [bookingReference]);
    if (!selected.rowCount) throw new Error('BOOKING_NOT_FOUND');
    const booking = selected.rows[0];
    const details = validateOccupancyDetails(input, { adults: Number(booking.adults), children: Number(booking.children), infants: Number(booking.infants), pets: Number(booking.pets) });
    await client.query('DELETE FROM booking_occupants WHERE provisional_booking_id=$1', [booking.id]);
    await client.query('DELETE FROM booking_pets WHERE provisional_booking_id=$1', [booking.id]);
    for (const [position, occupant] of details.occupants.entries()) await client.query(`INSERT INTO booking_occupants(provisional_booking_id,preferred_name,category,position) VALUES($1,$2,$3,$4)`, [booking.id, occupant.preferredName, occupant.category, position]);
    for (const [position, pet] of details.pets.entries()) await client.query(`INSERT INTO booking_pets(provisional_booking_id,species,other_species,breed,size,service_animal,position) VALUES($1,$2,$3,$4,$5,$6,$7)`, [booking.id, pet.species, pet.otherSpecies, pet.breed, pet.size, pet.serviceAnimal, position]);
    await client.query(`INSERT INTO booking_activity(provisional_booking_id,actor,event_type,details) VALUES($1,$2,'occupancy_details_updated',$3::jsonb)`, [booking.id, actor, JSON.stringify({ namedOccupants: details.occupants.length, pets: details.pets.length, serviceAnimals: details.pets.filter((pet) => pet.serviceAnimal).length })]);
    await client.query('COMMIT');
    return getOccupancyDetails(bookingReference, database);
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}
