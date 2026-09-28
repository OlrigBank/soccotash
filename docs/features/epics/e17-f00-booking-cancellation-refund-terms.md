# E17-F00 — Booking, cancellation and refund terms

## Status

Implemented on `agent/e17-booking-cancellation-refund-terms`. Ready for
review. The branch includes the E16 payment-page dependency and has not been
merged or deployed.

## Policy decision

The draft suggestions were evaluated against the existing booking lifecycle.
The selected presentation is progressive disclosure: a concise summary during
offer review, the same terms beside payment, and the full policy in the
private reservation record. This keeps the decision visible without making the
customer read a long policy before seeing the price.

The launch policy is:

- maximum party size: 8 guests;
- 25% deposit, with the existing 7-day initial-payment and 42-day balance
  deadlines;
- 30 days or more before arrival: 100% of verified payments refunded;
- 14 to 29 days before arrival: 50% of verified payments refunded;
- fewer than 14 days before arrival: 0% refunded;
- no additional 48-hour cooling-off promise;
- no processing-fee exclusion or security deposit promise until configured.

## Delivered

- Added `site/src/lib/pricing/cancellation-terms.ts` with a versioned policy
  snapshot, readable customer copy and deterministic refund calculation.
- Extended the accepted booking payment-terms snapshot with the cancellation
  policy and added migration `064_cancellation_refund_terms.sql` to backfill
  existing snapshots.
- Added the terms summary and expandable refund-band table to offer review,
  payment and reservation views.
- Added a cancellation outcome panel showing verified payments, the policy
  percentage and the estimated refund.
- Added the same policy and estimate to the administrator reservation view,
  with a form to record the final refund decision and reason in audit activity.
- Included the refund estimate in cancellation activity while preserving the
  existing date-release, payment-history and conversation behaviour.

## UI patterns

- **Terms summary panel** — custom responsive pattern.
- **Refund bands table** — custom semantic table.
- **Expandable full terms** — native `<details>` control.
- **Cancellation outcome panel** — custom stateful summary pattern.
- **Refund decision form** — custom administrator form using native controls.

## Verification

- `npm --prefix site run check` — 0 errors and 0 warnings; two existing hints
  remain in unrelated admin pages.
- `npm --prefix site run build` — production server build completed.
- The full booking-lifecycle suite passes (89 tests), including the refund
  calculator and UI contract tests.
- The E16 payment-page dependency is included so the terms are rendered on the
  real payment route.
- Browser verification was attempted against the rebuilt server. The execution
  sandbox permits the build but blocks local HTTP listening with `EPERM`, and
  no Chrome or in-app browser surface was available for DevTools inspection.
  Playwright and Lighthouse therefore remain a release-gate follow-up for the
  offer, payment, confirmed and cancelled states at phone, tablet and desktop
  widths. The permanent source contract tests cover the customer/payment terms
  pattern and the administrator refund-decision path until that environment is
  available.

## Release notes

Refunds are estimates until an administrator records the final decision. No
Stripe or bank refund is initiated by this epic. Existing accepted bookings
retain their payment amounts and deadlines; the migration only adds the
versioned cancellation policy where a payment snapshot already exists.
