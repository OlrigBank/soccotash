# Feature 1 — Compact Booking-panel Foundation

## Parent epic

[Up-front Booking Panels on the Landing and Listing Pages](./epics/getting-a-booking-panel%20on%20the%20landing%20page-and%20every-listing-page.md)

## Objective

Provide a reusable, compact public component that checks authoritative
availability and pricing for a standard arrangement and presents an honest
enquiry state for Olrig Bank Bespoke.

## Scope

- Support a selectable homepage mode and a fixed-property listing mode.
- Capture dates, adults, children, infants and pet count.
- Use the existing availability and quote APIs without client-side pricing.
- Present available, unavailable, host-priced, error and Bespoke states.
- Invalidate displayed results whenever a material input changes.
- Generate a continuation link containing only the non-contact selections.
- Record context and outcome analytics without dates, party data or personal
  information.
- Do not place the component on a public page in this feature.

## Acceptance criteria

1. The component can be configured with no property or one valid fixed
   property.
2. A fixed-property instance does not render a property selector.
3. Standard checks call the existing availability and quote endpoints.
4. Published results show nights, provisional GBP total and price details.
5. Host-priced and Bespoke states never fabricate price or availability.
6. Changing an input clears the earlier result.
7. Continuation contains arrangement, dates, category counts and pet count but
   no contact or detailed pet data.
8. Analytics contain source, property and result only.

## Validation

- Booking-lifecycle contract tests.
- Astro check and production build.
- Public browser integration is deferred until Features 2 and 3 instantiate
  the component.
