# E13-F03 — Simplify reservation party details

## Status

Implemented on `agent/e13-f03-pet-details` on 9 September 2026.
Awaiting owner acceptance. Part of [E13](epics/e13-f00-redesign-private-booking-pages.md).
F02 was accepted by the owner's instruction to proceed.

## Delivered behaviour

- Customer Reservation no longer asks for optional occupant names or displays
  the explanatory occupant/access copy.
- Bookings with pets show Pet details and Save pet details. Bookings without
  pets omit the entire editor.
- Customer pet saves leave every occupant record, identifier and position intact.
  They never read names back into a replacement write. Existing administration
  editing retains its occupant-and-pet save operation.
- Invalid pet submissions retain entered species, other species, breed, size and
  service-animal answers for correction. Failed validation does not persist changes.
- The planner's separate guest-name capture when duplicating plans is unchanged.

UI pattern: **Pet details form**, using native labels, text inputs, selects,
checkboxes, fieldsets and a submit button.

## Internal interfaces

`petDetailsFromForm` reads only pet fields. `replacePetDetails` validates against
locked authoritative booking counts and updates pets in a transaction, recording
`pet_details_updated` activity. The existing `replaceOccupancyDetails` operation
continues to support administration. No schema or migration is required.

The private page uses `save-pet-details`; older `save-occupancy-details` submissions
remain accepted as pet-only edits. Supplied occupant fields cannot alter stored
names through either customer action. Account ownership checks are unchanged.

## Verification

- Production build passed. Astro check: zero errors/warnings and two existing
  administration hints. All 86 booking lifecycle test files passed.
- Both existing booking regressions passed: request persistence/resumption with
  pet details and bespoke negotiation/cancellation.
- All 24 account/Reservation/pet browser tests passed across 320×800, 390×844,
  768×1024 and 1440×900. Pet regression coverage includes zero/two pets, hidden customer name fields,
  invalid submissions retaining drafts, unchanged database rows on failure,
  successful saves/reload, legacy forms ignoring supplied occupant fields,
  administrator name editing and subsequent customer saves preserving those
  exact occupant rows, including identifiers and timestamps.
- Chrome DevTools inspected a disposable signed-in booking at 320×800, 390×844,
  768×1024 and 1440×900. Checked the absent editor with zero pets, a one-pet form,
  native keyboard selection and visible focus, invalid other-species submission,
  retained answers, successful correction/save, accessible structure, console,
  network and overflow. No overflow or console errors/warnings were observed;
  the save POST returned 200 and the fixture occupant name remained stored.
- Mobile and desktop Lighthouse snapshots scored 100 in all reported categories,
  with zero failed audits. Reports: `/tmp/e13-f03-mobile/` and
  `/tmp/e13-f03-desktop/`. These snapshots exclude performance.

Limitations: Chrome used an injected disposable local session; the account suite
covers real local email verification and HttpOnly cookie creation. Fixtures send
no notifications and are deleted after use. Administration's existing narrow-screen
reservation drawer overlaps the occupant-save button for pointer clicks; its
unchanged save path was verified using keyboard submission. The overlap remains
outside this customer-page change. No production changes, customer contact, merge
or deployment were performed.
