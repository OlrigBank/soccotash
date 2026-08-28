# PR #46 feature summary — Controlled cancellation lifecycle

## Status

- Pull request: [#46 — Add a controlled cancellation lifecycle](https://github.com/OlrigBank/soccotash/pull/46)
- Target branch: `development`
- Feature branch: `agent/cancellation-lifecycle-acc-test`
- Accepted implementation head: `ca784104be8508c5e81993e5552775b2d6f95aec`
- Final interactive acceptance result: passed on 3 August 2026
- Production and Render were not changed during feature development or
  acceptance testing.

## Objective

Give both Olrig Bank administrators and the Booker a controlled way to cancel
an active booking without deleting its permanent record.

Cancellation must release the dates immediately while retaining the booking,
conversation, accepted offer, and payment evidence. The private Booker page
must remain accessible and must describe the cancelled state without implying
that the booking is still confirmed, payable, or active.

PR #46 began as the controlled cancellation acceptance test recommended by PR
#45. Source inspection and test-first work showed that the existing
administrator transaction already had a sound foundation, but that the Booker
had no cancellation entry point and cancelled presentation could misstate the
price and payment state. The work therefore became a focused corrective and
acceptance PR.

## Accepted behaviour

1. An administrator can cancel a booking from every active lifecycle state:
   `pending`, `offered`, `offer_accepted`, `payment_pending`,
   `payment_reported`, `confirmed`, and the legacy-compatible `approved` state.
2. A Booker with a valid private access token can cancel from the same active
   states.
3. Booker cancellation is a separate action from declining an offer.
4. Both actors must provide a visible cancellation reason and explicitly
   confirm that the booking and its dates should be cancelled.
5. A successful cancellation atomically:
   - changes the booking status to `cancelled`;
   - records a `booking_cancelled` technical activity with the correct actor,
     reason, and canonical lifecycle-rule identifier; and
   - inserts a permanent conversation message visible to both parties.
6. If any part of that transaction fails, status, activity, and conversation
   changes are rolled back together.
7. Cancellation immediately releases the booking's dates for another request.
8. The booking record, private Booker page, conversation, accepted offer, and
   payment history remain available after cancellation.
9. An open reported payment is closed as `cancelled`; already verified payment
   evidence remains verified.
10. A cancelled booking cannot be cancelled again and no repeat-cancellation
    controls are displayed.
11. Cancelled-state wording takes precedence over confirmed, paid, offer, and
    payment-due wording on the private Booker page.
12. A request cancelled before accepting an offer displays **Recorded
    provisional total**, not **Accepted total**.
13. A booking with recorded acceptance evidence retains **Accepted total** and
    the accepted price after cancellation.
14. The administrator view retains an accepted offer as **Price at
    cancellation** rather than reverting a cancelled Bespoke booking to
    **Price to be agreed**.
15. Administrator-initiated cancellation targets the Booker notification
    channel. Existing WhatsApp delivery remains conditional on active consent
    bound to the currently stored normalized telephone number, with the
    established email fallback.
16. Booker-initiated cancellation targets the configured administrator email
    recipient and includes a link to the permanent administration record.
17. Notification delivery or configuration failure is recorded after the
    cancellation transaction and does not reverse a valid cancellation.
18. PR #45's reachable-contact invariant and PR #43's optional,
    number-bound WhatsApp consent safeguards remain unchanged.

## Architectural decisions

### Canonical lifecycle rules for both actors

The executable transition model in `site/src/lib/booking/lifecycle.ts` now
declares Booker cancellation alongside administrator cancellation for every
active status. Both actors use the same destination, requirements, calendar
effect, activity event, and permanent-message audience. The actor determines
the notification target: Booker for administrator cancellation, administrator
for Booker cancellation.

The generated `docs/booking-lifecycle.md` matrix is kept in sync with these
rules. New cancellation behaviour therefore cannot exist only in a route or
template without also appearing in the canonical lifecycle contract.

### One shared transactional cancellation operation

`site/src/lib/booking/cancellation-lifecycle.ts` contains one internal
actor-aware transaction. The public administrator function and the
token-authenticated Booker function delegate to it.

The Booker variant resolves the existing private access credential before the
transaction begins. Invalid or revoked credentials reveal no booking and
return `not_found`. No new authentication mechanism or public booking
identifier was introduced.

Within the transaction, the booking row is locked, the lifecycle rule is
checked, dates are released by moving to terminal status, open reported
payments are closed, technical activity is written, and a bot conversation
message is inserted. A failure in any step rolls back the complete change.

### Cancellation-specific presentation state

`site/src/lib/booking/cancellation-display.ts` centralizes validation and the
wording needed by a cancelled private page. Cancellation is evaluated before
confirmed, fully-paid, current-offer, or balance-due presentation.

The accepted/provisional distinction is based on actual acceptance evidence
(`acceptedAt`, accepted customer state, or a post-acceptance lifecycle state),
not merely on the final `cancelled` status. This decision was added after the
first interactive administrator-cancellation case exposed the misleading
**Accepted total** label on a request cancelled while still pending.

The administrator price helper separately retains a genuine accepted offer as
the price at cancellation.

### Notification targeting and failure isolation

Lifecycle email targets are derived from the canonical actor-specific
cancellation rules. Administrator cancellation continues through the existing
Booker delivery path, including PR #43's current-number consent check and email
fallback. Booker cancellation creates a distinct administrator email with the
reason and permanent administration link.

Delivery happens only after the database cancellation commits. Its result is
written as technical activity, so a missing recipient or provider failure is
visible without restoring an already cancelled booking or re-blocking dates.

### Focused, migration-free change surface

The existing database model already supported the required terminal state,
activity, conversation, offer, payment, and private-access evidence. PR #46
therefore requires no database migration and does not delete or rewrite
historical records.

The feature changes the lifecycle rules, shared cancellation transaction,
private Booker route and view, cancelled presentation helpers, notification
selection, generated lifecycle documentation, and focused tests. It does not
change pricing policy, payment amounts, WhatsApp consent policy, or production
configuration.

## Testing procedure

### Test-first development

The first branch commit added the cancellation contract before changing
application code. The baseline retained 51 passing lifecycle tests and
introduced 10 expected failures covering the missing PR #46 behaviour.

Implementation then made the complete lifecycle suite pass. Two acceptance
findings received focused regression coverage:

- a deployment-marker assertion prevents a PR #46 test deployment from being
  presented as PR #45; and
- a presentation test proves that `cancelled` alone is not evidence of an
  accepted offer.

### Automated validation

The relevant commands, run from the repository root, are:

```bash
npm run test:booking-lifecycle
npm run check:booking-lifecycle-docs
npm run check
npm run build
```

Before final interactive acceptance:

- 63 of 63 booking-lifecycle tests passed;
- generated lifecycle documentation was current;
- Astro diagnostics reported zero errors; and
- the production build completed successfully.

The PostgreSQL integration test was syntax-checked locally. Its database-backed
execution is provided by the pull-request GitHub Actions workflow, which runs
PostgreSQL 17, Node.js 22, the lifecycle suite, the complete integration suite,
Astro diagnostics, and the production build.

The new automated coverage includes:

- cancellation by both authorized actors from every active state;
- token-authenticated Booker route wiring;
- required reason and confirmation;
- correct lifecycle rule, actor, activity, and conversation evidence;
- rollback after an injected conversation-write failure;
- immediate availability release;
- preserved accepted offer and verified payment evidence;
- closing an open reported payment;
- refusal of invalid-token and repeated cancellation attempts;
- cancelled-state private and administrator wording;
- provisional versus accepted total selection;
- administrator notification targeting for Booker cancellation; and
- WhatsApp eligibility remaining bound to active consent for the current
  number.

### Interactive acceptance loop

Each deployed iteration followed the established project procedure:

1. Deploy the exact feature-branch commit to the owner's local Docker
   environment.
2. Expose it through the current temporary Cloudflare Quick Tunnel.
3. Open or recover a fresh Chrome Cloud Browser connection.
4. Refresh from the server and confirm the branch and iteration marker.
5. Create one clearly labelled disposable booking for the next transition.
6. Perform only that cancellation case.
7. Verify the private page, administrator record, activity, permanent
   conversation, and released availability.
8. Stop immediately at the first unexpected result.

Temporary tunnel addresses, private Booker links, and credentials were not
committed.

### Interactive acceptance evidence

| Case | Accepted result |
| --- | --- |
| Administrator cancellation | Booking became `cancelled`; actor and reason were recorded; permanent conversation remained available |
| First pending-cancellation presentation | Exposed **Accepted total** wording defect; acceptance stopped before creating the Booker case |
| Iteration 4 regression | The same administrator-cancelled record displayed **Recorded provisional total** |
| Date release after administrator cancellation | 23–25 August 2026 became available immediately |
| Booker cancellation requirements | Both reason and explicit confirmation were required |
| Booker cancellation | Booking `2b80b356-1ad5-4dec-be25-b47aa6c9a79e` became `cancelled` with audit actor `customer`/Booker |
| Booker permanent record | Reason, conversation, private page, price, and payment history remained accessible |
| Terminal controls | Repeat-cancellation and offer controls were absent |
| Date release after Booker cancellation | 23–25 August 2026 became available again |
| Administrator notification selection | A `skipped` delivery activity was recorded because the local deployment had no administrator notification recipient configured |

No further defect was found on iteration 4.

## Known quirks

- `BOOKING_ADMIN_EMAIL` is the preferred recipient for Booker-to-administrator
  lifecycle notifications and `BOOKING_EMAIL_REPLY_TO` is the fallback. The
  local acceptance environment had neither configured, so recipient selection
  and skipped-delivery auditing were verified, but successful external
  administrator-email delivery was not exercised end to end.
- Reserved or deliberately non-deliverable test email addresses are suitable
  for failure/fallback tests but cannot prove successful external delivery.
- Cloudflare Quick Tunnel addresses are temporary. Always obtain the current
  tunnel address before continuing an acceptance session.
- The Cloud Browser service can fail while creating its first fresh tab. This
  is an infrastructure symptom, not evidence of an Olrig Bank application
  failure. Reconnect once and verify that no form submission occurred before
  resuming.
- The administrator dashboard branch/iteration label is source metadata, not
  automatic Git information. PR #46 added a regression assertion for its
  value, but future feature branches must still update the marker deliberately.
- Cancellation and deletion are intentionally different. A cancelled record
  remains available; deleting a pending or offered request follows a separate
  administrator-only lifecycle action.
- Declining an offer and cancelling a booking are also intentionally separate.
  Decline remains specific to an offered price, while cancellation closes the
  complete active booking lifecycle and releases its dates.
- `cancelled` must never be used by itself as acceptance evidence. The accepted
  price label requires a recorded acceptance timestamp, customer state, or
  post-acceptance lifecycle state.
- Payment history is evidence, not a refund ledger. PR #46 preserves verified
  and cancelled payment records but does not implement refund calculation or
  payment-provider reversal.

## Products used in the workspace

| Product | Use in this feature |
| --- | --- |
| GitHub and draft PR #46 | Branch history, review boundary, and permanent feature record |
| GitHub Actions | PostgreSQL-backed integration, lifecycle, type-check, and build validation |
| Astro with the Node adapter | Private Booker page, administrator pages, and production build |
| TypeScript / Node.js 22 | Lifecycle rules, cancellation services, presentation policy, and tests |
| PostgreSQL 17 | Transactional status, payment, activity, message, token, and availability evidence |
| Docker | Owner's local feature-branch deployment |
| Cloudflare `cloudflared` Quick Tunnel | Temporary external access to the local deployment |
| ChatGPT Work Cloud Browser using Chrome | Shared administrator and Booker acceptance testing |
| Resend email path | Existing lifecycle email delivery and skipped/failure auditing |
| Meta WhatsApp integration from PR #43 | Existing optional, explicit, current-number-bound Booker notification behaviour |

No real guest contact method, payment-provider reversal, live WhatsApp message,
or production deployment was required for PR #46 acceptance.

## Next recommended feature

After review and database-backed CI, merge PR #46 into `development` and run
the normal post-merge development smoke test.

The next focused work item should make administrator notification readiness
visible and verify Booker-cancellation email delivery end to end. It should:

- treat `BOOKING_ADMIN_EMAIL` (or the documented reply-to fallback) as an
  explicit deployment-readiness item;
- show administrators whether the lifecycle notification recipient is
  configured without exposing its full value publicly;
- send one controlled Booker-cancellation email to an authorized test
  recipient; and
- verify the delivered message, administration link, delivery activity, and
  retry/idempotency behaviour.

That work should remain separate from refund policy and payment-provider
reversal. Those require explicit commercial rules for refundable amounts,
deadlines, fees, authorization, and audit evidence before implementation.
