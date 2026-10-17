import { BookerError } from '../booker/accounts.ts';
import { getProperty } from '../booking/config.ts';
import { isIsoDate, nightsBetween } from '../booking/dates.ts';
import { bookerContactSubmissionError, validateBookerContact } from '../booking/booking-contact.ts';
import { compatibilityGuestTotal, validatePartyComposition } from '../booking/party-composition.ts';
import { assessPublishedOccupancy } from '../occupancy/assessment.ts';
import { getPublishedPricingQuote } from '../pricing/public.ts';
import { directOfferDecision } from '../booking/direct-offer.ts';
import { createProvisionalBooking } from '../booking/repository.ts';

/** Register an offline request without impersonating or signing in its booker. */
export async function createAdminBooking(form: FormData, administratorId: string) {
  const text = (key: string) => String(form.get(key) ?? '').trim();
  const property = getProperty(text('propertyId'));
  const name = text('name');
  const arrival = text('arrival'), departure = text('departure');
  const today = new Date().toISOString().slice(0, 10);
  if (!property) throw new BookerError('Choose an accommodation option.');
  if (name.length < 2 || name.length > 120) throw new BookerError('Enter the booker’s name using 2 to 120 characters.');
  const contact = validateBookerContact({ email: text('email'), telephone: text('telephone') });
  const contactError = bookerContactSubmissionError(contact);
  if (contactError) throw new BookerError(contactError);
  if (!isIsoDate(arrival) || !isIsoDate(departure) || arrival < today ||
    nightsBetween(arrival, departure) < property.minimumNights || nightsBetween(arrival, departure) > 365) {
    throw new BookerError(`Choose future dates with at least ${property.minimumNights} night(s) and no more than 365 nights.`);
  }
  let party;
  try {
    party = validatePartyComposition({ adults: Number(text('adults')), children: Number(text('children')), infants: Number(text('infants')) });
  } catch { throw new BookerError('Enter at least one adult and non-negative whole-number party counts.'); }
  const message = text('message');
  if (message.length > 2000) throw new BookerError('Keep the request notes within 2,000 characters.');
  const occupancyAssessment = await assessPublishedOccupancy(property.id, { ...party, pets: 0, serviceAnimals: 0 });
  const guests = compatibilityGuestTotal(party);
  const pricingQuote = property.administratorPriced || occupancyAssessment.result.outcome !== 'standard' ? null :
    await getPublishedPricingQuote({ propertyId: property.id, arrival, departure, bookingDate: today, guests, pets: 0, channel: 'direct', cancellationPlan: 'flexible' });
  const decision = directOfferDecision({ propertyId: property.id, administratorPriced: property.administratorPriced,
    occupancyOutcome: occupancyAssessment.result.outcome, pricingQuote });
  const ready = text('stage') === 'payment';
  if (!['payment', 'review'].includes(text('stage'))) throw new BookerError('Choose the booking stage.');
  if (ready && !decision.automaticOffer) throw new BookerError(`${decision.reviewReason} Save for review to prepare a tailored offer.`);
  return createProvisionalBooking({ administratorId, propertyId: property.id, arrival, departure, guests, party,
    occupancyAssessment, pets: 0, name, email: contact.email, telephone: contact.telephone,
    telephoneE164: contact.telephoneE164, message, pricingQuote, publishDirectOffer: ready });
}
