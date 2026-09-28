# E18-F05 — Public request and returning Booker integration

## Status

Implemented and subsequently accepted on `feat/e18-finalise-payment-page`. The owner
accepted E18-F04's work but correctly identified that its completion claim did
not establish integration through the public entry points. This milestone closes
that verification gap and corrects the returning-booking routes. Nothing merged
or deployed. Later accepted refinements and final regression evidence are recorded
in [E18-F08](e18-f08-merge-readiness.md).

## Delivered

- The homepage Quick Check, Cottage listing widget and standalone Request a stay
  form now have full browser coverage starting with an anonymous guest choosing
  dates through the calendar, checking the quote, entering details and verifying
  an actual email code through the application endpoints before reaching payment.
  These initial entry routes already reached the new payment page; the missing
  return routes below were still sending guests to the old reservation workflow.
- Your bookings now directs unfinished requests to their payment/review page.
  A single accessible booking follows the same rule as a booking-list selection.
  Paid bookings and closed bookings open their reservation workspace.
- Saved root booking URLs use the same destination rule. Explicit Messages,
  Reservation and Holiday Planner workspace URLs remain available.
- A saved Edit link that requires sign-in returns to the requested stay/details
  step, preserving the booking reference and populated fields. The same restricted
  return-path validation is shared between sign-in and server navigation.
- Booking-list cards use “Continue to payment”, “View payment progress”, “View
  request progress” or “View reservation”, without exposing raw database statuses.
- The account page now explicitly prevents private responses being cached and
  suppresses the referrer header.

## UI pattern names

- **Booking continuation card** — custom card using a native link, with the
  destination and action label determined by booking/payment state.
- **Sign-in return to editing** — custom navigation workflow using the existing
  native verification form controls and restricted local return paths.

## Verification — 28 September 2026

- Rebuilt application; Astro check reported zero errors/warnings. Three hints:
  the two existing admin hints and an unused-variable hint for the redirect
  destination in Astro's early-return block. Browser coverage verifies that
  redirect executes and uses the destination correctly.
- All 30 Playwright tests passed: nine new public-entry/return tests, 12 saved
  request/acceptance tests, six payment-layout tests and three card-completion
  tests. Each suite covers 390 × 844, 768 × 1024 and 1440 × 900.
- Each public-entry test starts without a session, uses the visible date picker,
  verifies its unique email code, creates the booking, returns through the account
  list and saved root URL, signs in again from an Edit link and saves an edit to
  the same booking. Card completion additionally checks paid bookings returning
  through the account list and root URL to their reservation.
- The 91 booking-lifecycle test files passed, including new destination and
  return-path cases for unfinished, verified, closed and unsafe return URLs.
- Chrome DevTools manually exercised the homepage widget through details,
  locally captured email verification and payment. Inspected empty and populated
  booking-list states, keyboard focus and Enter navigation back to payment.
  The booking list had no document or unintended local overflow at all three
  viewports, and no console errors were observed. Inspected booking-list document
  requests returned HTTP 200; automated tests check the final redirect destinations.
- Mobile and desktop Lighthouse on the final booking-list view: Accessibility
  100, Best Practices 100, Agentic Browsing 100, SEO 66. Private-page indexing is
  intentionally blocked. The tool does not include performance scoring.

## Local owner review

Start from the actual homepage at <http://127.0.0.1:8087/>, the
[Cottage listing](http://127.0.0.1:8087/listings/cottage/) or
[Request a stay](http://127.0.0.1:8087/book/). Choose dates and continue normally.
For convenient manual review, `changed@example.test` is auto-verified by this
local fixture. The automated public tests use unique addresses and actual codes.

Run `npm run test:public-booking-journey` to rebuild/start this fixture and repeat
the public journey tests. For a persistent manual server, build first and run
`REQUEST_PREVIEW_PUBLIC_JOURNEY=yes node tests/support/request-journey-preview.mjs`.
Use a fresh fixture server when repeating tests: it has its own disposable schema,
and completed test bookings deliberately remain for subsequent return checks.

The fixture intercepts email transport into an in-memory mailbox and blocks
external delivery. A test-only endpoint ages verification request timestamps to
model the normal 60-second resend cooldown during rapid re-authentication tests;
production verification limits are unchanged. These fixture endpoints are absent
from the production app. No real customer credentials, messages, payments or
external calendar feeds were used. The public-footer contrast limitation from
E18-F02 remains outside the changes in this milestone.
