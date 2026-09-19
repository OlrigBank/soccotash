# E16-F00 — New payment page

## Status

Implemented and ready to close after review. The branch is ready for a pull
request into `development`; it has not been merged or deployed.

## Objective

After a customer submits a booking request and the host reviews it, provide a
clear private payment journey. The customer can accept an offer, pay by card
through hosted Stripe Checkout, or use the supplied bank-transfer details. A
successful payment ends in a confirmed reservation, while an unverified bank
transfer remains clearly pending.

## Delivered

- Added `/booking/manage/[token]/payment/`, linked from the customer booking
  request and offer states.
- Added customer states for review pending, offer ready, payment due, transfer
  awaiting verification, confirmed, balance due and cancelled/expired offers.
- Preserved the configured deposit, full-payment and balance-payment schedule.
- Added card checkout creation with a stable checkout-attempt record and
  idempotent reuse for retries.
- Added signed `/api/stripe-webhook/` handling for checkout completion,
  duplicate events, payment failure and late payment after cancellation. A late
  payment is recorded as `refund_required` for operator follow-up.
- Added bank-transfer instructions using configured payee, sort code and
  account number values, with the existing report-and-verify lifecycle.
- Updated customer and operator payment history so card and bank-transfer
  methods, references and statuses are visible in the booking record.
- Added migration `site/db/063_stripe_checkout_attempts.sql` and deployment
  configuration placeholders for the payment settings and Stripe secrets.
- Added lifecycle, integration and browser regression coverage for the new
  route and payment transitions.

## UI patterns

- **Reservation payment summary** — custom responsive summary pattern.
- **Payment method choice** — custom stateful choice pattern using native
  buttons and links.
- **Mobile payment bar** — custom responsive pattern; sticky on narrow screens
  and hidden at tablet and desktop widths.
- **Hosted card checkout** — Stripe's hosted payment control.
- **Bank-transfer instructions** — custom information and continuation pattern.

## Verification evidence

### Automated

- `npm --prefix site run check` — passed with 0 errors and 0 warnings; two
  existing hints remain in unrelated admin pages.
- `npm --prefix site run build` — passed.
- `npm --prefix site run test:booking-lifecycle` — 88 tests passed.
- `site/tests/integration/card-checkout-lifecycle.test.ts` — passed, including
  checkout idempotency, signed webhook handling, deposit and balance payment,
  duplicate events, late-payment refund flagging and bank-transfer contention.
- `tests/booking-regression/direct-offer.spec.ts` — passed at 390, 768 and
  1440px widths.
- Existing bank-transfer payment-history integration coverage passed.

### Browser and accessibility

Chrome DevTools and Playwright inspected the rebuilt local application with
disposable fixtures at phone (390px), tablet (768px) and desktop (1440px)
widths. Review, offer, payment-pending and confirmed states returned HTTP 200;
headings and landmarks were available, focus was visible, there was no
document-level horizontal overflow, and no console errors or failed requests
were observed. The payment bar appeared only on the phone layout.

The production build was audited with Lighthouse at the phone width. The
payment page recorded Performance 0.80, Accessibility 1.00, Best Practices
1.00 and SEO 0.66; the existing reservation page recorded 0.82, 1.00, 1.00
and 0.66 under the same local conditions. A later repeat after the sticky-bar
adjustment was limited by the local Chromium run returning `NO_FCP`; the
feature record documents that environment limitation. No real customer,
Stripe account or notification was contacted.

## Deployment and operations

Set these values before enabling card payments:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `BOOKING_BANK_PAYEE`
- `BOOKING_BANK_SORT_CODE`
- `BOOKING_BANK_ACCOUNT_NUMBER`

Register the Stripe webhook endpoint at `/api/stripe-webhook/` for checkout
session completion and payment failure events. Apply migration 063 before
serving the new route. GoCardless Instant Bank Pay is not enabled; bank
transfer is the supported non-card method in this delivery.

## Closure recommendation

The requested payment page and both payment routes are implemented, covered
and documented. Close E16-F00 after the pull request is reviewed and merged;
deployment configuration and live Stripe webhook registration remain the
operator's release step.
