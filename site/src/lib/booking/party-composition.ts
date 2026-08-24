export type PartyComposition = {
  adults: number;
  children: number;
  infants: number;
};

export class PartyCompositionError extends Error {
  readonly code = 'INVALID_PARTY_COMPOSITION';

  constructor(message = 'Party composition must contain at least one adult and non-negative whole-number counts.') {
    super(message);
    this.name = 'PartyCompositionError';
  }
}

export function validatePartyComposition(input: PartyComposition): PartyComposition {
  const party = {
    adults: Number(input.adults),
    children: Number(input.children),
    infants: Number(input.infants),
  };
  if (
    !Number.isInteger(party.adults)
    || !Number.isInteger(party.children)
    || !Number.isInteger(party.infants)
    || party.adults < 1
    || party.children < 0
    || party.infants < 0
  ) {
    throw new PartyCompositionError();
  }
  return party;
}

export function partyCompositionFromLegacyGuests(guests: number): PartyComposition {
  return validatePartyComposition({ adults: guests, children: 0, infants: 0 });
}

/**
 * Transitional meaning of provisional_bookings.guests and existing pricing
 * inputs. Infants are deliberately excluded.
 */
export function compatibilityGuestTotal(party: PartyComposition): number {
  const valid = validatePartyComposition(party);
  return valid.adults + valid.children;
}
