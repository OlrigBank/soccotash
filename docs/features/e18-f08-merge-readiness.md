# E18-F08 — Final regression and merge readiness

The owner accepted the transfer retry implementation in E18-F07 and requested
the next task. This checkpoint consolidates the completed E18 scope and checks
the remaining browser suites against application commit `9922842` on
`feat/e18-finalise-payment-page`. It introduces no new UI pattern or behaviour.

## Accepted behaviour

| Journey | Current behaviour and record |
| --- | --- |
| Payment layout | Payment details and Reservation summary are separate responsive panels; one payment method is displayed at a time. [E18-F01](e18-f01-payment-layout.md) |
| Standard request | Check your stay → Your details → Make a payment. Verified details create the booking reference; saved edits reuse it and recheck availability and pricing. [E18-F02](e18-f02-request-journey.md) |
| Requests requiring review | Bespoke and promotion-code requests retain review and explicit submission. [E18-F02](e18-f02-request-journey.md) |
| Acceptance | The checkbox accepts booking/cancellation terms and the reservation summary when card checkout or bank-details disclosure begins. No separate “Your offer is ready” step. [E18-F03](e18-f03-payment-acceptance.md) |
| Public entry and return | Homepage, listing and standalone request entry reach payment; returning Bookers resume the appropriate booking state. [E18-F05](e18-f05-public-journey-integration.md) |
| Reported transfer | Reporting money sent opens the main booking page while receipt awaits verification. [E18-F06](e18-f06-transfer-booking-home.md) |
| Transfer not received | Dashboard receipt check; visible admin message; conversation link back to fresh payment selection; prior accepted details and payment history retained. Covers deposits and balances. [E18-F07](e18-f07-transfer-retry.md) |
| Card completion | A verified signed payment event confirms payment; the return URL alone does not. Deposit, balance, cancellation and replay are covered. [E18-F04](e18-f04-final-verification.md) |

## Final verification — 28 September 2026

Final browser runs use fresh isolated local fixture databases and rebuilt
application servers, with `CI=1` preventing accidental reuse of a stale preview:

```sh
CI=1 npm run test:payment-layout
CI=1 npm run test:payment-completion
CI=1 npm run test:public-booking-journey
```

Stop task preview servers before these commands. The initial layout run reused
an old fixture whose one-hour session had expired, redirecting to sign-in. That
run was discarded; fresh fixture results are recorded below.

| Suite | Result | Viewports |
| --- | --- | --- |
| Payment layout | 6 passed | 390 × 844, 768 × 1024, 1440 × 900 |
| Card completion | 3 passed | 390 × 844, 768 × 1024, 1440 × 900 |
| Public request and returning Booker | 9 passed | 390 × 844, 768 × 1024, 1440 × 900 |

The accepted E18-F07 checkpoint also passed 15 request-journey cases at the same
three widths, all 91 lifecycle tests, the isolated payment-history integration
test, build and Astro check (zero errors/warnings; two existing admin hints).
Together these suites cover 33 browser cases. DevTools inspection, keyboard and
focus checks, overflow findings and Lighthouse results for the final changed UI
are recorded in E18-F07. This checkpoint only updates documentation.

## Merge and deployment hand-off

All requested E18 implementation milestones are accepted. The task branch is
ready for merge review; neither merging nor deployment has been authorised or
performed. Unrelated workspace changes and the owner's untracked epic/source
images remain untouched.

Apply `site/db/065_request_journey_revision.sql` before running the application
version that uses saved request journeys. Existing bookings receive revision
zero and keep their existing flow. The migration has only been exercised in
disposable local schemas during this work.

Bank configuration and Stripe webhook requirements remain documented in
[Booking payment page](../booking-payment-page.md). Verification used dummy bank
details, simulated card transport, signed local webhook events and intercepted
email verification. No live card charge, bank transfer, external calendar feed,
real customer notification or production migration was performed. The shared
public-footer contrast finding from E18-F02 remains outside this epic's changes;
the broader legacy booking suite was not rerun at this checkpoint.
