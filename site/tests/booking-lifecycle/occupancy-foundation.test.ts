import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  PartyCompositionError,
  compatibilityGuestTotal,
  partyCompositionFromLegacyGuests,
  validatePartyComposition,
} from '../../src/lib/booking/party-composition.ts';

test('party composition defines the transitional guest total unambiguously', () => {
  assert.deepEqual(partyCompositionFromLegacyGuests(6), {
    adults: 6,
    children: 0,
    infants: 0,
  });
  assert.equal(compatibilityGuestTotal({ adults: 4, children: 3, infants: 2 }), 7);
  assert.deepEqual(validatePartyComposition({ adults: 1, children: 0, infants: 0 }), {
    adults: 1,
    children: 0,
    infants: 0,
  });
});

test('party composition rejects missing adults, negative counts and fractions', () => {
  for (const party of [
    { adults: 0, children: 1, infants: 0 },
    { adults: 1, children: -1, infants: 0 },
    { adults: 1, children: 0, infants: -1 },
    { adults: 1.5, children: 0, infants: 0 },
  ]) {
    assert.throws(
      () => validatePartyComposition(party),
      (error: unknown) => error instanceof PartyCompositionError
        && error.code === 'INVALID_PARTY_COMPOSITION',
    );
  }
});

test('occupancy migration documents and enforces compatibility semantics', async () => {
  const [migration, repository] = await Promise.all([
    readFile(new URL('../../db/046_booking_party_composition.sql', import.meta.url), 'utf8'),
    readFile(new URL('../../src/lib/booking/repository.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(migration, /SET adults = guests/);
  assert.match(migration, /NEW\.guests := NEW\.adults \+ NEW\.children/);
  assert.match(migration, /CHECK \(adults >= 1\)/);
  assert.match(migration, /CHECK \(children >= 0\)/);
  assert.match(migration, /CHECK \(infants >= 0\)/);
  assert.match(migration, /Infants are recorded but excluded/);
  assert.match(repository, /validatePartyComposition\(input\.party \?\? partyCompositionFromLegacyGuests\(input\.guests\)\)/);
  assert.ok(
    repository.indexOf('const party = validatePartyComposition')
      < repository.indexOf('await expireElapsedBookingOffers()', repository.indexOf('export async function createProvisionalBooking')),
    'the service boundary must reject an invalid party before performing database work',
  );
});
