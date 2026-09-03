# E09-F04 — Harmonise Booker Reservation Management

## Status

Accepted on 3 September 2026 after implementation and verification.

## Parent epic

[`E09 — Harmonise the Public UI with the Landing Page`](epics/e09-f00-harmonise-the-public-ui-with-the-landing-page.md)

## Problem

The private Booker area uses a generic **OB** application badge and makes the
Booker's name the primary page heading. Its Reservation, Chat and Holiday
Planner choices disappear after entering a workspace, leaving a general back
button as the principal means of moving between related booking tasks.

The functionality and privacy boundary are strong, but the experience does not
yet feel like a continuation of the Olrig Bank website or keep the stay itself
as the customer's point of orientation.

## Desired outcome

1. The private area uses the established Olrig Bank identity while remaining
   unmistakably private.
2. Property, booking state, Booker and dates provide a stable hierarchy.
3. Reservation, messages and planning remain visible and navigable throughout
   the management journey.
4. Existing offer, payment, messaging, cancellation, occupancy and privacy
   behaviour remains unchanged.

## Scope

- Replace the generic header badge with the established Olrig Bank logo.
- Label the area as a **Private stay area** and retain the link to the public
  website.
- Make the property the main heading, with Booker and dates as context.
- Rename **Chat** to **Messages** for clearer and more consistent terminology.
- Keep workspace navigation visible after entry and mark the current workspace.
- Provide responsive full-card and compact workspace navigation treatments.
- Retain the booking overview as the route to the saved-link panel.

## Explicit exclusions

- Changing access tokens, permissions, expiry, indexing or cache rules.
- Changing booking state, offers, prices, payments or cancellation rules.
- Sending messages or notifications as part of visual verification.
- Redesigning the detailed planner tools; that is E09-F05.
- Changing administration booking workflows.

## Acceptance criteria

1. `BookerLayout` uses the Olrig Bank header artwork and identifies the private
   area in text.
2. The property is the page `h1`; Booker name and dates remain visible.
3. Reservation, Messages and Holiday Planner links appear on overview and
   workspace pages.
4. The current workspace uses `aria-current="page"` and a visible state that
   does not depend on colour alone.
5. Phone workspace navigation remains compact without horizontal overflow.
6. The saved-link panel remains confined to the overview.
7. Reservation, offer, payment, message, occupancy, cancellation and planner
   routes and mutations remain unchanged.
8. Private pages retain `no-store`, `noindex`, no-referrer and token
   authorisation protections.
9. Existing Booker and lifecycle contracts pass.

## Verification plan

- Run focused E09-F04, Booker workspace, access, payment, messaging,
  cancellation and occupancy contracts.
- Run the complete lifecycle suite, Astro check and production build.
- Use non-notifying local fixtures or existing previews for Chrome inspection
  where available; never expose a token or contact a customer for testing.
- Verify phone, tablet and desktop layout, focus, current workspace, overflow
  and console output.

## Completion evidence

- The Booker header now uses the established Olrig Bank artwork, identifies the
  **Private stay area** and keeps a clearly labelled route to the public
  website.
- The stay is anchored by the property heading, with the booking reference,
  Booker and dates retained as context.
- Reservation, Messages and Holiday Planner navigation remains present within
  each workspace. The selected destination uses `aria-current="page"`, a border
  and a pale-green surface.
- Existing access, booking, offer, payment, message, occupancy, cancellation
  and planner operations were not changed.
- The focused E09-F04 and Booker workspace contracts pass.
- The complete booking lifecycle suite passes: 84 tests, 0 failures.
- `astro check` completes with 0 errors. Its sole hint is the pre-existing
  unused `safeReturn` declaration in the administration login page.
- The production build and the Docker image build complete successfully, and
  the rebuilt local service reports healthy.
- Chrome DevTools verification used the deployed stylesheet with a
  non-notifying representative private-area presentation because no reusable
  raw customer token is retained. At 390 px, 768 px and 1440 px there was no
  document-level horizontal overflow; all three destinations remained visible.
- A mobile Lighthouse snapshot scored 100 for accessibility, best practices,
  SEO and agentic browsing. An initial contrast finding on the small header and
  selected-workspace labels was corrected before the successful audit.
