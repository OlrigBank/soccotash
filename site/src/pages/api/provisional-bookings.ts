import type { APIRoute } from 'astro';
import { getProperty } from '../../lib/booking/config';
import { nightsBetween } from '../../lib/booking/dates';
import { createProvisionalBooking } from '../../lib/booking/repository';

export const prerender = false;
export const POST: APIRoute = async ({ request }) => {
  try {
    const input = await request.json();
    const property = getProperty(String(input.propertyId || ''));
    if (!property) return Response.json({ error: 'Unknown property.' }, { status: 400 });
    const arrival = String(input.arrival || '');
    const departure = String(input.departure || '');
    const guests = Number(input.guests);
    const name = String(input.name || '').trim();
    const email = String(input.email || '').trim();
    const nights = nightsBetween(arrival, departure);
    if (nights < property.minimumNights || guests < 1 || guests > property.maximumGuests || !name || !email.includes('@')) {
      return Response.json({ error: 'Please check the dates, guest number and contact details.' }, { status: 400 });
    }
    const reference = await createProvisionalBooking({ propertyId: property.id, arrival, departure, guests, name, email, telephone: input.telephone, message: input.message });
    return Response.json({ reference, status: 'pending' }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === 'DATES_UNAVAILABLE') return Response.json({ error: 'Those dates are no longer available.' }, { status: 409 });
    console.error(error);
    return Response.json({ error: 'The request could not be saved.' }, { status: 500 });
  }
};
