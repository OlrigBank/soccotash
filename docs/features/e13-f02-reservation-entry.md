# E13-F02 — Reservation as the booking entry page

## Status

Implemented on `agent/e13-f02-reservation-entry` on 9 September 2026.
Accepted by the owner’s instruction to proceed on 9 September 2026. Part of [E13](epics/e13-f00-redesign-private-booking-pages.md).
F01 was accepted by the owner's instruction to continue. F03 remains planned.

## Delivered behaviour

- The existing individual booking root now renders Reservation immediately,
  with its status, stay details, price and applicable actions visible.
- Removed the individual booking overview, return button and link-saving panel,
  including its clipboard/refresh handlers and unused styling.
- The page eyebrow and document-title prefix consistently use Your booking.
  Existing Reservation status headings distinguish pending requests, offers,
  payment stages, confirmation and cancellation.
- The booker/stay summary uses British dates, for example 19 October 2099 to
  23 October 2099. Accommodation headings remain unchanged.
- Existing Reservation, Messages and Holiday Planner routes, legacy workspace
  queries, query-string notices, form actions and sign-in returns remain usable.
- Offer copy now directs people to the response options below when Reservation
  is already open. Combined administration previews retain their existing copy.
- No API, schema, authentication or booking-policy changes. Occupant and pet
  editing remains for F03.

UI pattern: **Booking section navigation**, a custom arrangement of native links
with the active destination identified using `aria-current="page"`.

## Verification

- Production build passed. Astro check: zero errors/warnings and the same two
  existing administration hints. All 86 booking lifecycle test files passed.
- Account browser suite: all 20 tests passed across 320×800, 390×844, 768×1024
  and 1440×900. Added real local database fixtures for pending, offered,
  payment-pending, payment-reported, confirmed and cancelled Reservation entry.
- After adding root-form validation coverage, all four focused Reservation tests
  passed again. An invalid cancellation POST keeps the request pending and shows
  its server error on the root page. No real booking is cancelled by that check.
- Coverage includes British date labels, immediate Reservation, selected links,
  removed controls, root/explicit-route notices, keyboard Messages navigation,
  unavailable planner state, legacy workspace links and signed-out return paths.
- Both existing booking regression tests passed against the rebuilt fixture
  server: persisted non-notifying request creation/resumption and bespoke offer
  negotiation/cancellation. Updated their stale F01 header assertions.
- Chrome DevTools inspected a disposable signed-in booking at all four widths,
  including pending/price-not-yet-agreed, offered, confirmed, cancelled-with-notice
  and empty Messages states. Checked keyboard skip/navigation, visible focus,
  accessible structure, overflow and relevant requests. No document overflow,
  console errors or warnings were observed. Private responses retain no-store,
  no-referrer and no-index headers and load no analytics scripts.
- Reservation Lighthouse snapshots scored 100 in all reported categories with
  zero failed audits on phone and desktop. Reports:
  `/tmp/e13-f02-reservation-mobile/` and `/tmp/e13-f02-reservation-desktop/`.
  These snapshots do not measure performance.

Limitations: interactive Chrome used a disposable session injected solely for
local presentation inspection; the account suite independently verifies the real
email-code flow and HttpOnly session cookies. State-matrix fixtures directly set
local booking/offer rows without sending notifications or creating holds. Browser
POST validation and booking success/negotiation are covered by Playwright. The
interactive fixture was deleted after inspection. No customer contact, production
changes, merge or deployment was performed.
