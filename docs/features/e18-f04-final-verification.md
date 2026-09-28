# E18-F04 — Payment continuation and final verification

## Status

E18's implemented milestones are ready for final owner review on
`feat/e18-finalise-payment-page`. The owner accepted E18-F03 before this stage.
Nothing has been merged or deployed, and no production data has been changed.

## Final adjustments

- Reporting a bank transfer from Make a payment returns to that page's
  “Bank transfer awaiting verification” state. Existing reports originating from
  the reservation workspace retain their previous destination.
- Once self-service editing closes, the reservation summary provides a direct
  booking-messages link for requesting stay or contact changes.
- Added a disposable local card-provider simulation and browser coverage for
  cancellation, retry, return before verification, signed payment events,
  deposit and balance completion, and duplicate event delivery.

**Locked-summary change request** is a custom explanatory pattern using a native
link. **Transfer verification continuation** is a custom server-rendered state
reached through a native form. The provider simulation is a test fixture, not a
customer-facing UI pattern or an implementation of Stripe's hosted interface.

## Requirement review

| Requirement | Implemented behaviour |
| --- | --- |
| Two panels | Payment details contains payment controls and terms; the reservation summary contains stay, contact and pricing information. |
| One payment method at a time | Card and bank links select the displayed method. |
| Standard request journey | Check your stay → Your details → Make a payment; verified details create the reference. |
| Bespoke exceptions | Bespoke and promotion-code requests retain explicit review and submission. |
| Earlier-step edits | Saved edits reuse the reference, recheck prices/availability and require verification for changed contacts. |
| Acceptance | The checkbox covers booking/cancellation terms and the reservation summary; submitting either initial payment action records acceptance. |
| Editing boundary | Initial payment actions end self-service editing; subsequent changes use booking messages. |
| Confirmation | Bank details requests, transfer reports and card return URLs do not confirm payment. Verified payment does. |
| Reservation link | The summary link appears only after a verified payment. |
| Existing payment rules | Hosted Stripe remains; deposit/full-payment and balance rules are preserved. No new discounts or security deposits. |

## Verification — 28 September 2026

- Build passed. Astro check: zero errors/warnings, two existing admin hints.
- Booking lifecycle suite: 90 passed. Updated the existing workspace-route
  contract to recognise the payment-page return destination.
- Database integration: eight passed across direct-offer, card-checkout and
  payment-history suites. Disposable schemas exercise acceptance, availability,
  stale edits/terms, ownership, replay, verified payments and late-payment handling.
- Playwright: 21 passed — 12 request-journey, six payment-layout and three new
  card-completion tests. All run at 390 × 844, 768 × 1024 and 1440 × 900.
- Card completion uses the rebuilt application, an intercepted provider transport
  and signed events sent to the real application webhook route. Tests prove a
  return URL and an invalid signature cannot confirm payment, retries reuse an
  open session, and duplicate deposit/balance events do not repeat the charge due.
- Chrome DevTools inspected bank-details disclosure, required transfer validation,
  the awaiting-verification continuation and summary message link. All three
  widths had no document or unintended local overflow. Required validation and
  the message link had visible focus; Enter opened the correct conversation.
  No browser console errors were observed; inspected continuation documents
  returned HTTP 200.
- Final awaiting-verification Lighthouse audits, mobile and desktop: Accessibility
  100, Best Practices 100, Agentic Browsing 100, SEO 66. The failed indexing audit
  is intentional for private booking pages. The tool excludes performance scores.
  Earlier acceptance and saved-details audits are recorded in E18-F02/F03.

## Reproduction and merge hand-off

Run `npm run test:request-journey`, `npm run test:payment-layout` and
`npm run test:payment-completion`. Each suite can start its rebuilt fixture server
against local PostgreSQL. The completion fixture uses port 8086 and blocks all
external requests; the ordinary review fixture uses port 8085.

For interactive review, open <http://127.0.0.1:8085/__request-preview/> and use any
name with `journey@example.test`. Fixture URLs expire when their server stops.

Apply migration `065_request_journey_revision.sql` before deploying this version.
It has only been applied to disposable schemas during this work. Merge and
deployment still require the owner's approval.

Limitations: no live Stripe session, real bank transfer, customer notification
delivery or external calendar integration was exercised. The broader legacy
booking regression suite was not rerun; its direct-offer and bespoke tests were
updated to navigate explicitly to the still-supported reservation response route,
because unpaid payment pages deliberately omit the reservation-summary link.
The pre-existing shared public-footer contrast issue recorded in E18-F02 remains.
