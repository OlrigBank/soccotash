# Feature 5 — Preserved Continuation into `/book/`

## Parent epic

[Up-front Booking Panels on the Landing and Listing Pages](./epics/getting-a-booking-panel%20on%20the%20landing%20page-and%20every-listing-page.md)

## Objective

Carry a visitor's compact-panel choices into the complete request form without
trusting transferred browser state or reusing a stale quote.

## Scope

- Transfer arrangement, arrival, departure, adults, children, infants and pet
  count from the homepage and all four listings.
- Accept only a configured arrangement, real ISO dates within the request
  window and bounded whole-number party counts.
- Apply the selected arrangement's minimum stay before accepting transferred
  dates.
- Populate detailed pet rows from the transferred count while leaving pet
  descriptions and contact details for the full form.
- Immediately obtain a fresh authoritative availability and quote response for
  a complete transferred stay.
- Clear reviewed quote state after any material change and require another
  authoritative check before submission.
- Retain server-side property, date, occupancy, availability and price
  validation, including changed-quote responses.

The legacy `property` query parameter remains supported for ordinary links,
but only the compact panel's `propertyId` parameter activates full transfer and
automatic rechecking.

## Validation

- Homepage and four-listing continuation contract coverage.
- Transfer allow-list, date and integer-validation tests.
- Quote invalidation and server revalidation contract tests.
- Complete booking-lifecycle contract suite.
- Astro check and production build.
- Browser journey review when Browser is available.
