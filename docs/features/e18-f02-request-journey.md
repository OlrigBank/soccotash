# E18-F02 — Saved request journey review milestone

## Status

Implemented on `feat/e18-finalise-payment-page` for iterative review. Nothing
merged or deployed. This completes the second milestone, not the full epic.

## Delivered

- Standard priced requests continue from verified Your details directly to
  Make a payment, creating their booking reference at that point. Bespoke and
  promotion-code requests retain explicit review and submission.
- The payment progress trail and summary Edit links return to saved stay and
  contact details. Saving reuses the same booking reference and owning account,
  recalculates the quote, checks availability and verifies changed contact details.
- Availability excludes only the authenticated Booker's own editable booking
  hold. Transactional updates replace the automatic offer and preserve the
  previous booking if validation fails.
- Submission replay, browser Back and stale tabs are handled without creating a
  second booking or silently overwriting newer changes. A stale acceptance form
  cannot accept an offer after the saved journey has changed.
- Legacy bookings and bespoke requests retain their existing workflow.

Migration `065_request_journey_revision.sql` must be applied before using this
application version. Verification applied it only to disposable local schemas.

## Transitional acceptance boundary

This transitional boundary has now been replaced by
[acceptance within payment](e18-f03-payment-acceptance.md). The description below
records the behaviour at the original E18-F02 review point.

The separate acceptance checkbox and “Accept offer and continue to payment”
button remain in this milestone. Self-service editing currently ends at offer
acceptance. The next milestone will record acceptance when starting card checkout
or requesting bank details, and move the editing boundary to those actions.
Requesting bank details must not confirm payment or the reservation.

## Local review

Build with `npm run build`, then run `npm run preview:request-journey`. Open
<http://127.0.0.1:8085/__request-preview/> and use any name with
`journey@example.test`; this disposable account already has that email verified.
Use `changed@example.test` to exercise local contact re-verification. Add
`?bespoke=1` to the preview entry URL for the review-and-send route.

Each preview uses its own migrated PostgreSQL schema, removed on normal shutdown.
The runner blocks external fetches, removes notification credentials and uses
dummy provider settings. It never charges a card or contacts a customer. Calendar
refresh logs report the absent external feed; local stored availability is used.
The preview entry route is not part of the production application.

## UI pattern names

- **Saved booking progress trail** — custom progress navigation using native
  links and current-step semantics.
- **Summary edit links** — native links with descriptive accessible names.
- **Saved booking form** — custom multi-step flow using native form controls and
  the existing custom date picker.
- **Stale booking recovery** — custom feedback with native reload and return
  links; unsaved fields remain available after a conflict.

## Verification — 28 September 2026

- Astro check: zero errors and warnings; two pre-existing admin hints. Build
  passed. Booking lifecycle suite: 90 tests passed.
- Isolated direct-offer integration suite: six tests passed, including creation,
  edits, replay, ownership, verification, competing edits, stale acceptance,
  availability-conflict rollback and the acceptance editing boundary.
- Playwright: six request-journey tests and six payment-layout tests passed at
  390 × 844, 768 × 1024 and 1440 × 900. Journey coverage includes stale quotes,
  browser Back, saved dates/contact edits, re-verification, conflicting tabs,
  anonymous access, bespoke/promotion review, keyboard operation and overflow.
- Chrome DevTools inspected the rebuilt running application at those three
  widths: saved details, continuation to payment, summary edits, accessible
  landmarks/names, visible keyboard focus and no document or unintended local
  overflow. No browser console errors were observed; payment documents returned
  HTTP 200. The automated conflict workflow verifies expected HTTP 409 recovery.
- Lighthouse saved-details page: mobile and desktop Accessibility 96, Best
  Practices 100, SEO 69; Agentic Browsing 100 mobile and 97 desktop. The
  accessibility failure is an existing shared-footer paragraph contrast issue
  (`#64726b` on `#2f373a`, 2.4:1), outside this milestone's changed UI.
- Lighthouse new payment journey: mobile Accessibility 100, Best Practices 100,
  Agentic Browsing 100, SEO 66. Private-page indexing is intentionally blocked.
  The DevTools Lighthouse tool does not provide a performance score.
- Limitations: disposable local fixtures, no live provider, notification or
  external calendar verification. The final combined acceptance/payment flow
  remains for the next milestone.
