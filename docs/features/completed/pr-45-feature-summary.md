# PR #45 feature summary — Require a reachable Booker contact method

## Status

- Pull request: [#45 — Require a reachable Booker contact method](https://github.com/OlrigBank/soccotash/pull/45)
- Target branch: `development`
- Feature branch: `agent/require-reachable-booker-contact`
- Accepted feature-code head: `89a5c3d4dc5e20f19076b06c234a415859f3345a`
- Final interactive acceptance result: passed on 3 August 2026
- Production was not changed during feature development or acceptance testing.

## Objective

Prevent an active ordinary or Bespoke booking from reaching the offer,
payment, and confirmation lifecycle unless Olrig Bank retains at least one
valid external way to contact the Booker.

The defect exposed by PR #44 was not a failure of the private Booker page. A
contactless Booker could use that page while they retained its private link,
but Olrig Bank had no recovery channel if the link was lost or the Booker
stopped replying there. PR #45 therefore makes a valid email address or
telephone number a booking invariant while preserving the private page as an
important fallback.

## Accepted behaviour

1. Every newly submitted ordinary or Bespoke booking request must contain at
   least one valid Booker contact method:
   - a valid email address;
   - a valid telephone number; or
   - both.
2. Email-only bookings are valid.
3. Telephone-only bookings are valid.
4. Providing a telephone number does not imply WhatsApp consent.
5. WhatsApp consent remains optional, explicit, and unticked by default.
6. Automated WhatsApp delivery remains conditional on active consent bound to
   the stored normalized telephone number.
7. An administrator can add or correct Booker email and telephone details.
8. Every successful administrator contact change creates a
   `booker_contact_updated` technical activity entry containing the previous
   and new values.
9. An active booking cannot lose its final valid contact method.
10. A rejected final-contact removal preserves the stored contact details,
    creates no success activity, redirects with
    `contact=final_contact_required`, and visibly explains the rejection.
11. Legacy bookings without contact details remain readable and do not require
    a destructive data migration.
12. A legacy contactless booking cannot publish its first offer until a valid
    email address or telephone number is added.
13. Changing the telephone number does not transfer number-bound WhatsApp
    consent. Existing consent is withdrawn and must be obtained again for the
    replacement number.
14. Existing email delivery, WhatsApp skip/fallback behaviour, and private
    Booker-page messaging remain intact.

For the final-contact rule, `pending`, `offered`, `payment_pending`,
`payment_reported`, and `confirmed` are active. `declined`, `cancelled`,
and `expired` are terminal and inactive.

## Architectural decisions

### One shared contact policy

The policy is centralized in
`site/src/lib/booking/booking-contact.ts`. Public submission, administrator
updates, offer publication, status feedback, and tests use the same
normalization and validation rules rather than maintaining separate ordinary
and Bespoke implementations.

Email values are trimmed, lower-cased, length-limited, and syntactically
validated. Telephone validation reuses PR #43's
`normaliseWhatsAppTelephone()` E.164 normalization. PR #45 does not
reimplement or weaken PR #43's WhatsApp safeguards.

### Compatibility instead of a mandatory database migration

No migration attempts to make an existing contact column unconditionally
non-null. That would reject legitimate legacy rows and make deployment depend
on repairing historical data in advance.

Instead, the invariant is enforced at the lifecycle boundaries:

- new booking submission rejects missing or malformed contact details;
- the first offer cannot be published for a legacy contactless booking; and
- an administrator cannot remove the final contact method from an active
  booking.

This preserves access to legacy and terminal records while stopping active
contactless bookings from progressing.

### Number-bound consent

The displayed telephone, normalized E.164 telephone, and WhatsApp consent state
remain distinct concerns. A valid telephone makes a booking reachable but does
not grant WhatsApp consent. When the normalized telephone changes, consent
bound to the old number is invalidated rather than copied.

### Transactional administrator updates and audit evidence

The existing administrator contact endpoint updates email and telephone
together. Successful updates and their
`booker_contact_updated` activity are treated as one database operation. The
redirect includes `contactActivity=<id>`, allowing the page to confirm that
the technical activity was actually written.

Rejected updates preserve the booking and create no misleading success
activity. Iteration 6 added trace points around the route and helper to make
this boundary diagnosable. Iteration 7 added explicit rejected-update feedback
and automatically exposes it in the Reservation drawer.

The historical route path still ends in `/email/`, although it now handles
both Booker email and telephone. This was retained to avoid an unnecessary
route migration.

### Focused change surface

The final feature modifies the public booking API, shared contact policy,
booking repository projection, administrator contact route and booking view,
and the small dashboard iteration marker. It adds dedicated unit and
PostgreSQL integration tests. Ordinary and Bespoke requests continue through
the same provisional-booking endpoint and therefore share the policy.

## Testing procedure

### Automated validation

The GitHub Actions workflow used PostgreSQL 17 and Node.js 22 and ran, from the
`site` directory:

```bash
npm ci
npm run test:booking-lifecycle
npm run test:booking-integration
npm run check
npm run build
```

At accepted feature-code head `89a5c3d4`, the complete Booking access
lifecycle workflow passed. This included 51 booking-lifecycle tests, the
PostgreSQL integration suite, Astro type-checking with no errors, and the
production build.

The new tests specifically cover:

- email-only and telephone-only validation;
- missing and malformed contact feedback;
- active versus inactive booking statuses;
- administrator telephone removal semantics;
- final-contact rejection and visible status mapping;
- atomic contact update and audit creation;
- preservation of data and absence of activity after a rejected update; and
- telephone-change invalidation of WhatsApp consent.

### Interactive acceptance loop

Each iteration followed this sequence:

1. Make one focused source and test change.
2. Run the full workflow against the exact branch head.
3. Deploy the feature branch to the owner's local Docker environment.
4. expose that deployment through a temporary Cloudflare Quick Tunnel;
5. open a fresh Cloud Browser tab and confirm the dashboard iteration marker;
6. use unmistakably named disposable booking records;
7. perform one state transition;
8. refresh from the server and verify persisted state, URL feedback, technical
   booking activity, and, where necessary, the PostgreSQL row; and
9. stop at the first unexpected result before beginning another case.

Temporary tunnel URLs, administrator credentials, and private Booker links
were deliberately not committed.

### Interactive acceptance evidence

The final deployed iteration passed the following cases:

| Case | Accepted result |
| --- | --- |
| Ordinary email-only request | Created successfully without a telephone |
| Ordinary telephone-only request | Created successfully without implying WhatsApp consent |
| Missing or invalid contact | Rejected with focused validation feedback |
| Administrator correction | Saved successfully with a matching `booker_contact_updated` activity |
| Remove final active contact | Rejected; contact preserved; message visible; no activity added |
| Change consented telephone | New number saved; WhatsApp changed from active to withdrawn |
| Legacy pending contactless booking | First-offer publication rejected; booking remained pending |
| Bespoke request without contact | Rejected and no booking row created |
| Bespoke telephone-only resubmission | Created pending with WhatsApp `not requested` |
| Email/private-page regression | Message remained on the private page when test email delivery failed |
| WhatsApp fallback regression | Delivery recorded as skipped when consent had not been requested |

The deliberately seeded legacy record was restored to a valid telephone-only
state after its guard test.

## Known quirks

- Cloudflare Quick Tunnel addresses are temporary. Always obtain the current
  deployment URL rather than reusing one recorded in a chat.
- Cloud Browser pages can retain stale HTML after redeployment or database
  seeding. Refresh from the server before judging a result.
- In the Cloud Browser automation, clearing an input with an empty
  `fill("")` operation could behave as a no-op and resubmit the original
  value. For final-contact tests, confirm the live input value is genuinely
  empty or perform the destructive clear manually.
- Controls inside the Reservation drawer may be visible but not resolvable by
  accessibility role until the drawer is explicitly opened. A failed automated
  click is not evidence that the application rejected or accepted a request;
  verify whether a POST actually occurred.
- Reserved `example.com` addresses intentionally cannot prove successful
  external delivery. They are suitable for verifying that delivery failure is
  reported and that the permanent private-page fallback retains the message.
- A successful contact update should have all three forms of evidence: the
  persisted value, a `contactActivity` redirect value, and a matching
  technical activity entry. A rejected update should have none of the success
  evidence.
- Legacy contactless records are intentionally readable. This is compatibility
  behaviour, not proof that they may progress through the guarded offer
  boundary.
- A telephone number and WhatsApp permission are deliberately separate. Future
  work must not infer consent merely because a telephone is present.

## Products used in the workspace

| Product | Use in this feature |
| --- | --- |
| GitHub and draft PR #45 | Branch history, review boundary, and feature record |
| GitHub Actions | Node, PostgreSQL, lifecycle, integration, type-check, and build validation |
| Astro with the Node adapter | Application pages, API route, and production build |
| TypeScript / Node.js 22 | Shared contact policy and automated tests |
| PostgreSQL 17 | Booking state, normalized contact data, consent state, and technical activity |
| Docker | Owner's local branch deployment |
| Portainer | Container inspection and application-log checks during diagnosis |
| pgAdmin | Controlled legacy-state seeding and audit-row verification |
| Cloudflare `cloudflared` Quick Tunnel | Temporary external access to the local deployment |
| ChatGPT Work Cloud Browser using Chrome | Shared interactive acceptance testing |
| Resend | Existing email path and failure/fallback regression check |
| Meta WhatsApp integration from PR #43 | Existing optional, explicit, number-bound consent behaviour |

No real guest contact method, real payment, live WhatsApp message, or production
deployment was required for PR #45 acceptance.

## Next recommended feature

After review, merge PR #45 into `development` and run the normal post-merge
development smoke test.

The next focused work item should be **a controlled cancellation lifecycle
acceptance test**, followed by a separate corrective PR only if it exposes a
defect. That work should verify:

- administrator and Booker cancellation entry points;
- immediate release of blocked availability;
- preservation of payment history and technical audit evidence;
- correct email/private-page fallback;
- WhatsApp delivery only when consent is still active for the current number;
  and
- continued administrator access to the cancelled record without weakening
  PR #45's active-booking contact invariant.

Cancellation was deliberately left outside PR #44's completed Bespoke
lifecycle and remained an explicit unverified workflow during PR #45. Keeping
it separate avoids expanding this contact-integrity change after its acceptance
matrix has passed.
