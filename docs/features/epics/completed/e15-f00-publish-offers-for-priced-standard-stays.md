# E15-F00 — Publish offers for priced standard stays

## Status

Completed and closed with owner approval on 12 September 2026. Implementation
commit `6328ac7` and local verification are complete on
`agent/e15-direct-standard-offers`; no implementation work remains in this epic.

Closure records acceptance of the implementation. Merge, hosted development
acceptance and production deployment remain release follow-up steps; closure does
not claim they have already happened.

## Outcome and agreed decisions

A new, priced standard request receives a published offer immediately, without
Jenna's intermediate review. The Booker must still accept the offer, make the
required payment and await payment verification before the booking is confirmed.

Automatic offers require a standard occupancy assessment and an eligible published
price greater than zero for Olrig Bank or the Cottage. Bespoke, unpriced,
host-decision, promo-code and Olrig Bank++ requests retain administrator review.
Olrig Bank++ remains excluded because its additional accommodation availability
is not yet checked automatically. Estimates are not agreed totals.

Use the existing customer price breakdown, standard offer message, seven-day
expiry and no additional bespoke terms. Existing pending requests are not
backfilled or automatically offered.

This implements the immediate-offer option recorded in
[Future Feature — Direct Standard Booking](../../completed/future-direct-standard-booking.md).

## Customer experience and UI patterns

- **Priced stay summary — custom UI pattern:** the read-only request summary
  includes accommodation, dates, party and Total, Estimated total or Price to be
  agreed. Quick Check and the request form no longer promise that Jenna will
  confirm the price. Review exceptions use neutral explanations.
- **Direct offer continuation — custom UI pattern:** submission opens the existing
  private Reservation view with its published offer and acceptance/decline controls.
  Eligible customers do not see a pending-review stage or conversation message.
- Price details continue to use the browser's native `details`/`summary` disclosure.
  Existing native form controls and the verification journey are retained.

## Implementation and interfaces

- One server-side decision is shared by quoting, submission and booking creation.
  Quote responses add `automaticOffer` and `reviewReason` for customer guidance.
- Submission rechecks the published price. A missing or stale reviewed price
  receives HTTP 409 with the current quote; the Booker must review and resubmit.
  Unavailable dates still fail transactionally. Invalid published pricing remains
  ineligible.
- Booking creation, verified account ownership and the first publication share one
  transaction and the existing availability/submission locks. Publication failure
  rolls everything back. Sequential and concurrent retries reuse one booking/offer.
- The lifecycle permits system publication of an eligible first offer. Activity is
  attributed to `system`, without an administrator identity. Manual publication
  uses the same transaction-level publisher.
- New and replayed submission responses return the actual booking status rather
  than hard-coded `pending`.
- After commit, eligible requests use `booking_offer_available` notification
  delivery. They do not send a separate request acknowledgement. Delivery failure
  is recorded without undoing the offer; the existing administrator notification
  controls remain available. Submission replay does not resend notifications.
- No database migration, new provider configuration or production data change is
  required. Existing acceptance, payment, decline and expiry behaviour is reused.

## Local verification — 12 September 2026

- Astro check: zero errors and warnings; production build passed.
- Booking lifecycle suite: all 88 test files passed, including the updated explicit
  status/action/actor matrix and every direct-offer eligibility exception.
- Complete booking integration suite: all 48 checks passed under `TZ=UTC`. The
  first run under Europe/London passed 47/48; an unchanged holiday-planner date
  assertion shifts 10 October to 9 October in that timezone. The isolated planner
  test and complete suite both pass under UTC.
- E15 isolated database tests passed: matching price lines and totals, defaults,
  system attribution, review exceptions, date conflicts, notification failure,
  acceptance into `payment_pending`, decline, expiry and publication rollback.
- Playwright passed at 390, 768 and 1440 px: priced summary, verified contact,
  direct publication, matching displayed total, private Reservation continuation,
  retry status, missing/stale/removed-price recovery, promo-code review, concurrent
  submissions, one offer notification and no document overflow or page errors.
  `playwright.direct-offer.config.ts` runs this suite against a rebuilt local server;
  the standard booking-regression configuration also discovers the spec for CI.
- Chrome DevTools inspected the rebuilt application at 390 × 844, 768 × 1024 and
  1440 × 1000: summary, empty-date validation, published Reservation, accessible
  control names, keyboard focus, document overflow, console and quote/availability
  network responses. The offer opens directly with accept/decline controls and no
  Jenna-review message. No console warnings or errors were observed.
- Lighthouse snapshot: published offer scored 100 for accessibility, best practices,
  SEO and agentic browsing. Request form scored 97 for accessibility and 100 in the
  other categories. Its sole failure is the existing public footer paragraph
  contrast (`#64726b` on `#2f373a`); the footer styling is unchanged by E15.
  Performance was not measured by the snapshot audit.
- Verification used disposable local accounts/bookings and disabled provider
  credentials. No customer was contacted; real notification delivery and hosted
  deployment are not claimed as verified.

## Release and recovery

Review and merge the task branch, then verify eligible and retained-review paths
on hosted development before requesting production deployment approval. Observe
system offer-publication activity and notification failures after release.
Reverting the E15 code restores review for new requests; already-published offers
continue through the existing lifecycle. Never delete or reset them as rollback.
