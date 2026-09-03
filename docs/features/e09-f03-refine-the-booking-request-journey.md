# E09-F03 — Refine the Booking-request Journey

## Status

Accepted after implementation and verification.

## Parent epic

[`E09 — Harmonise the Public UI with the Landing Page`](epics/e09-f00-harmonise-the-public-ui-with-the-landing-page.md)

## Problem

The full booking request is presented as one long panel. Stay arrangement,
calendar, direct date fields, party details, availability action, price and
contact details have little visible separation, while contact details appear
only after a successful check. The underlying sequence is sound but is not
explained to the customer.

On a phone, the shared fixed **Check availability** link is also displayed while
the customer is already on `/book/`. It points back to the current page and
competes with the form's real availability action.

## Desired outcome

1. The request clearly presents three stages: choose the stay, check current
   availability and price, then send contact details.
2. Customers understand that sending a request neither charges them nor
   confirms a booking.
3. Transferred landing-page/listing selections enter the same flow and are
   rechecked against current server state.
4. The existing authoritative APIs and provisional-booking invariants remain
   unchanged.
5. The journey is focused, responsive and free of self-referential fixed
   actions.

## Scope

- Give `/book/` the centred no-sidebar booking-journey shell.
- Add concise expectation-setting copy to its introduction.
- Organise the existing form into semantic choose, check and request stages.
- Show and update an accessible progress indicator as the current state moves.
- Explain why the direct date inputs accompany the visual calendar.
- Remove the shared mobile contact bar from `/book/` itself.
- Preserve standard, transferred, unavailable, host-priced and Bespoke paths.

## Explicit exclusions

- Changing availability, occupancy or pricing rules.
- Changing the provisional-book API contract or database model.
- Adding payment collection or treating a request as confirmation.
- Redesigning the private Booker pages reached after submission.
- Changing accommodation definitions or Local Guide/content presentation.
- Changing administration booking review.

## Workflow decision

This remains one form rather than three pages. The existing client-side state
and server revalidation already protect continuity and stale quotes; dividing
the journey across new routes would add persistence and recovery risks without
evidence that separate pages are required.

The stages are progressive:

1. **Choose your stay** contains arrangement, dates, occupants and pets.
2. **Check availability and price** invokes the existing availability and quote
   APIs and presents their authoritative result.
3. **Send your request** is revealed only after the check succeeds and collects
   the existing contact, consent and optional-message fields.

Changing any stay input hides the contact stage, invalidates the reviewed quote
and returns progress to the first stage. Submission continues to recheck server
state and handles a changed quote through the existing conflict response.

## Acceptance criteria

1. `/book/` uses a centred no-sidebar layout and does not render the fixed link
   back to itself.
2. The introduction states that the customer will not be charged and the
   request does not confirm a booking.
3. One labelled progress list exposes the three stages and current stage.
4. The form uses semantic fieldsets and legends without changing field names or
   required values.
5. Stay or party changes invalidate the checked result, hide contact details
   and return progress to the choose stage.
6. Availability checking uses the existing availability and quote APIs and
   moves successful requests to the contact stage.
7. Unavailable or invalid selections remain in the choosing/checking portion
   with a clear status message.
8. Submission recalculates authoritative state, handles quote conflict and only
   redirects when a private booking page has been created.
9. Standard, Bespoke and transferred-state contracts continue to pass.
10. The page has no document-level horizontal overflow from 320 pixels upwards,
    has no new console errors and retains keyboard/touch operation.

## Verification plan

- Run the focused E09-F03 journey contract.
- Run all compact/full booking continuation, availability, pricing, occupancy,
  Bespoke and provisional-booking contracts.
- Run the complete booking-lifecycle suite, `astro check` and production build.
- Rebuild the Docker application.
- Exercise initial, transferred, invalid, unavailable, available/quoted and
  Bespoke states in Chrome at phone, tablet and desktop widths.
- Inspect progress semantics, focus, overflow, console output and mobile
  Lighthouse results.

## Completion evidence

- Moved `/book/` onto a focused, centred no-sidebar canvas and removed the
  redundant fixed link back to the current booking page.
- Rewrote the opening to describe the three actions and state explicitly that
  submitting neither charges the customer nor confirms a booking.
- Organised the existing single form into three semantic fieldsets: **Choose
  your stay**, **Check availability and price** and **Send your request**.
- Added an accessible three-stage progress list. The compact labels avoid
  crowding at phone widths while the fieldset legends retain the full stage
  names.
- Added state handling that marks the checking stage during authoritative
  requests, reveals the request stage after success and returns to the choose
  stage when a stay input invalidates the reviewed result.
- Preserved the existing availability, quote and provisional-booking APIs,
  reviewed-quote key, conflict response and validated private-page redirect.
- Preserved the distinct Bespoke path, which records preferred dates without
  claiming to check or reserve them.
- Explained that the direct date fields mirror the visual calendar and provide
  another exact-date input method.
- Corrected the generated calendar month heading from `h3` to `h2` after the
  first Lighthouse run identified a skipped heading level.
- Added `e09-booking-request-journey.test.ts` to protect the structure,
  progression, expectation copy and authoritative boundaries.
- Eight focused E09, continuation, range-calendar, pricing, occupancy and
  Bespoke contracts passed initially; the final heading-specific contracts
  also passed after the accessibility correction.
- The complete booking-lifecycle suite passed: 83 tests, 0 failures.
- `astro check` completed with 0 errors and 0 warnings, retaining the one
  pre-existing unused-`safeReturn` hint in `admin/login.astro`.
- The production build succeeded locally and in Docker, and the rebuilt Docker
  application reached its healthy state.
- Chrome DevTools verified the initial page at 320×700, 390×844, 768×1024 and
  1440×900 with no document-level horizontal overflow, no persistent sidebar,
  no fixed self-link and no console warnings or errors.
- A transferred available standard stay was rechecked automatically and moved
  progress to step 3 with the price/review and contact regions exposed.
- Editing the party after that check hid contact details, invalidated the result
  and returned progress to step 1 with a clear status message.
- A transferred Bespoke request hid the calendar, retained **Continue with
  request**, exposed the contact stage and stated that its dates were neither
  checked nor reserved.
- The final `/book/` mobile Lighthouse audit scored 100 for accessibility, best
  practices, SEO and agentic browsing, with all 58 audits passing.
