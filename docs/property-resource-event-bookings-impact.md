# Property, resources and event bookings: code impact

Source baseline: `agent/whatsapp-booking-payment-notifications` at
`de668c470fa35e9600d0e1a93ebccc207f5e5b91`.

## Compatibility mapping

- `provisional_bookings` remains the booking identity and lifecycle table. Its
  `property_id` column remains readable and is treated as the legacy arrangement
  key during this transition.
- `main-house`, `cottage`, and `whole-property` map to the new arrangements
  `main-house-stay`, `cottage-stay`, and `olrig-bank-stay` respectively.
- Existing pricing plans continue to use their current property keys. New
  `booking_arrangement_id` references make the operational meaning explicit
  without changing published prices.
- Existing offer `line_items` remain the versioned quotation lines. Migration
  018 adds immutable event, allocation, payment, and terms snapshots to each
  published offer.
- Imported `booking_blocks.property_id` values continue to be accepted and are
  mapped to Main House or Cottage resources by migration 018.

## Files and responsibilities

- `site/db/018_property_resources_events.sql`: schema, deterministic seeds,
  strict legacy backfill, allocation overlap constraint, and offer snapshots.
- `site/src/lib/booking/arrangements.ts`: public arrangement/resource model and
  compatibility helpers.
- `site/src/lib/booking/events.ts`: event validation, persistence, allocations,
  holds, conflict reporting, and offer snapshot preparation.
- `site/src/pages/events/request.astro` and
  `site/src/pages/api/event-requests.ts`: bespoke enquiry UI and endpoint.
- `site/src/pages/book.astro` and `BookingCalendar.astro`: arrangement-first
  entry language while retaining the current stay pricing flow.
- Admin booking detail: original enquiry, editable working details, independent
  resource allocations, hold expiry, and tailored offer controls.
- Booker private page and notification formatters: event title, schedule,
  resources, attendees, and itemised offer without admin-only fields.

## Lifecycle mapping

`pending` is the existing requested/enquiry state. Acceptance continues through
`payment_pending` and `payment_reported` before `confirmed`; no parallel status
machine is introduced. Allocation state is separate from commercial status.
Raw enquiries have no blocking allocation. `hold`, `offered`, `accepted`, and
`confirmed` allocations block; released allocations remain as audit history.

