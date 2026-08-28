# Feature 4 — Bespoke Listing and Homepage State

## Parent epic

[Up-front Booking Panels on the Landing and Listing Pages](./epics/getting-a-booking-panel%20on%20the%20landing%20page-and%20every-listing-page.md)

## Objective

Begin an Olrig Bank Bespoke enquiry from either public entry point without
presenting an ordinary availability result or an estimated price.

## Scope

- Map the Bespoke listing to the stable `bespoke-arrangement` booking property.
- Reuse the compact panel with that arrangement fixed on the listing.
- Collect preferred dates, adults, children, infants and pets.
- Render the enquiry explanation and **Start a Bespoke request** action in the
  initial listing HTML as well as after homepage selection.
- State that dates are not reserved or blocked and that Jenna will confirm the
  accommodation, availability and price.
- Continue to the full request journey without calling the availability or
  quote APIs from the Bespoke branch.

## Safeguards

- No green or ordinary available state.
- No provisional, zero or estimated price.
- No wording that implies a reservation or hold.
- No selection of a standard accommodation resource on the visitor's behalf.

## Validation

- Bespoke listing mapping and server-rendered wording contract tests.
- No-live-check Bespoke branch regression test.
- Complete booking-lifecycle contract suite.
- Astro check and production build.
- Browser review at the epic's required widths when Browser is available.
