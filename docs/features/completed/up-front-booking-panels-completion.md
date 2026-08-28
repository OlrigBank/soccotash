# Up-front Booking Panels — Completion Evidence

## Delivered journey

The homepage now moves directly from its photographic hero to **Plan your
stay**. Olrig Bank, The Cottage at Olrig Bank and Olrig Bank Max listing
openings pair their description with a panel fixed to the correct arrangement.
Olrig Bank Bespoke presents an enquiry fixed to its administrator-priced
arrangement.

Standard visitors enter dates and party composition, receive current
availability and an authoritative provisional GBP result where published
pricing applies, then use **Continue with request**. The full `/book/` form
validates and restores those selections, obtains a fresh result, and retains
contact details, detailed pet information, review and provisional-request
creation.

Bespoke uses **Start a Bespoke request** and states that the request does not
reserve or block dates. Jenna confirms the accommodation, availability and
price; no ordinary available state or estimated price is shown.

## Listing-to-property mapping

- Olrig Bank (`olrig-bank`) → `main-house`
- The Cottage at Olrig Bank (`cottage`) → `cottage`
- Olrig Bank Max (`event`) → `whole-property`
- Olrig Bank Bespoke (`bespoke`) → `bespoke-arrangement`

## Authoritative behaviour

The compact panel calls the existing availability and quote APIs and contains
no browser-side price calculation. `/book/` does not trust its query string:
it accepts only configured arrangements, real bounded dates and bounded whole
number counts before hydrating the form, then requests a fresh authoritative
result. Material changes clear the reviewed quote. Provisional submission
again validates property, dates, party and pets, reassesses occupancy,
recalculates published pricing and returns the existing changed-quote response
when necessary.

## Automated evidence

- 66 booking-lifecycle contract tests pass, including compact states,
  analytics privacy, all four listing mappings, Bespoke safeguards, transfer
  validation, quote invalidation and submission revalidation.
- Astro check completes with zero errors (one pre-existing unused-variable
  hint in `src/pages/admin/login.astro`).
- The production server build completes and prerenders all four listings.
- Public-release verification passes against the environment-backed production
  build for the homepage, listing index, three standard listing routes,
  contact page, sitemap and robots file (71 sitemap URLs).
- `git diff --check` passes.

## Viewport and interaction evidence

Automated browser review remains outstanding because the requested in-app
Browser had no connected instance during delivery. The implementation includes
the specified stacked phone layout and desktop listing split, but the epic's
320px, 375px, 390px, 430px, approximately 768px and 1280px visual checks and
keyboard-only review must be recorded when Browser becomes available.

## Consciously deferred

- Browser viewport, keyboard and live failure-path evidence, for the reason
  above.
- Instant confirmation, payment, reservation holds, alternative-date search
  and sticky booking controls remain outside this epic.
- No database changes were required.

## Delivery references

Features 1–5 are currently present together on the
`feature/homepage-booking-panel` branch. Commit and pull-request references
have not yet been created in this workspace.
