# E11-F03 — Verify bookers and introduce private accounts

## Status

Implemented on `agent/e11-f03-booker-accounts`; awaiting owner acceptance.
Part of [E11](epics/e11-f00-redesign-the-booking-page.md). The agreed rationale is
[OTP login approach](../source-material/AI%20Chats/OTP%20login%20approach.md).

## Behaviour

Step 2 sends a six-digit verification code when focus leaves the contact fields.
Email is preferred when both contacts are supplied. The booker can select SMS,
resend after the countdown, correct details and retry failed delivery. One
verified contact is required before review and server-side request creation.
An active account session satisfies verification for that account's verified
contact. An unverified second contact remains booking information only.

Verification creates a browser-bound, 30-minute grant, not an account. Successful
submission atomically creates or reuses an account, links the booking, consumes
the grant and stores a session. A random submission identifier and browser binding
recover committed submissions for 30 minutes, before rechecking a changed quote.
Failed persistence rolls back account creation and grant consumption.

The header's **Your bookings** icon opens code sign-in, the sole accessible
booking, or a selector for multiple bookings. Sessions last a fixed 30 days.
Logout revokes the current session and clears browser-bound verification state.
Booking changes and cancellation do not log the account out. Existing booking
revocation, deletion and post-departure expiry restrictions still apply.

Private pages, messages, payment reports, offer responses and booker planner
routes authorise the session against booking ownership. URLs contain booking
references, never session credentials. Old booking/offer bearer links no longer
grant access. Administrator and guest-planner permissions remain separate.
Private account layouts do not load analytics by default.

Account merging, additional sign-in identities and account profile editing are
not included. Editing booking contact details does not transfer a verified
account's ownership. Administrators can revoke or restore access to an individual
booking without sending a message.

## Interfaces and storage

- `POST /api/booker/request-code/`: `purpose` (`booking` or `login`), `channel`
  (`email` or `sms`) and `identifier`; returns challenge ID, retry delay and expiry.
- `POST /api/booker/verify-code/`: purpose, challenge ID and six-digit code;
  creates a grant for booking or a session for sign-in.
- `GET /api/booker/session/`: private current-session identities and unexpired
  browser grants, used to recognise previously verified contacts.
- `POST /api/booker/logout/`: revokes the session and redirects to sign-in.
- `POST /api/provisional-bookings/`: requires a UUID `submissionId` and a matching
  session identity or browser-bound grant. Returns a reference-based `managePath`.
- `/booking/` is the account entry point; `/booking/manage/{reference}/` retains
  the existing private-page/workspace shape. Some internal names and Astro's
  `[token]` parameter retain their historical names; they now accept references
  subject to session ownership, not bearer tokens.

Migrations `059_booker_accounts.sql` and `060_booker_claim_telephone_fallback.sql`
add accounts, unique verified identities, hashed sessions, challenges, grants,
durable request limits, submission recovery and booking ownership/claim fields.
Existing bookings use a valid normalised email as the claim contact, otherwise
E.164 mobile (including conversion of older display telephone values). Nothing
is pre-verified and migration sends no messages. On first verification, matching
unclaimed bookings are attached transactionally. Records without a usable contact
remain administrator-accessible for correction.

Session and browser-cookie tokens use 32 random bytes. Only SHA-256 token hashes
are stored. Cookies are HttpOnly, SameSite=Lax and Secure except on local HTTP
loopback. Booking grants are single-use, browser-bound and destination-bound.
Email codes use a separate-secret HMAC; Twilio validates SMS codes. Codes expire
after ten minutes and permit five checking attempts. PostgreSQL locks enforce
60 seconds between sends, five sends per destination per hour and twenty per IP
per hour across application instances and purposes. Login responses do not reveal
whether an identifier exists. Verification emails bypass booking BCC recipients.

Private/authentication responses are no-store, no-referrer and no-index. Mutation
routes validate origins, including browser-controlled same-origin metadata for
native form submissions carrying `Origin: null` under the no-referrer policy.

## Configuration and operation

The existing SMTP or Resend sender handles email verification. Set a separate
random `BOOKER_VERIFICATION_SECRET` of at least 32 characters. For SMS, configure
`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_VERIFY_SERVICE_SID`; configure
the Verify service for six-digit codes and ten-minute validity. SMS verification
is independent of optional WhatsApp notifications and consent.

The Docker Compose and Render files declare these settings without credentials.
Render can generate the verification secret. Existing Render services need
Dashboard configuration: `sync: false` only prompts during initial creation,
not Blueprint updates. SMS is unavailable until the provider is configured;
email remains usable. No provider account has been purchased or configured by
this implementation, and no live SMS delivery has been exercised.

Run `npm --prefix site run booker:prune` with database configuration periodically
(e.g. daily). It removes expired authentication records after a 24-hour grace
period and submission recovery records after 30 days. It does not delete accounts
or bookings. Expired credentials are rejected regardless of cleanup timing.

Use normal migration-before-start deployment. Do not deploy old bearer-link code
against the migrated application as a rollback: it would re-enable old access
semantics. Deployment, production migration and merging require owner approval.

## UI patterns

- **Contact verification panel** — custom interaction using native controls.
- **Verification code field** — native text input with numeric keyboard and
  one-time-code autocomplete; Enter verifies and focus advances after success.
- **Booker account entry** — custom header arrangement with a native icon link
  and a native logout form in the private area.
- **Booking selector** — custom list of native links to owned bookings.

## Verification evidence

- Astro check: zero errors and warnings, with the two existing administration
  hints. Production build passed.
- All 86 booking lifecycle test files passed.
- All 39 PostgreSQL integration tests passed with `TZ=UTC`, including new
  verification/ownership coverage and updated cancellation/payment fixtures.
- Public-experience regression: 209 passed, three expected skips. Account
  journeys: twelve tests passed across 320×800, 390×844, 768×1024 and 1440×900.
- Account tests exercise real local email delivery to a non-forwarding SMTP
  sink, real code checking, persisted creation, cookie hashing, repeat visits,
  multiple bookings, logout, re-entry, CSRF and old-link rejection. SMS success
  is exercised through an injected integration-test provider; browser fixtures
  cover delivery failure, switching/stale responses and expired codes.
- Tests use disposable schemas/records and disable recordings for authentication
  journeys. The test SMTP sink exists only in `tests/support/booker-server.mjs`,
  binds to loopback and cannot forward mail. No production test bypass is added.
- Chrome DevTools inspected the rebuilt application at phone, tablet and desktop
  widths, contact verification, review, private continuation and header access.
  Checked accessible names, keyboard operation, visible focus, overflow and
  relevant network behaviour. Verification focus loss was corrected and covered.
- Lighthouse snapshots: account sign-in and private booking scored 100 in each
  reported category. Public details/review scored accessibility 97/96 and 100
  in remaining categories; the existing footer paragraph contrast remains the
  applicable failure. Snapshots do not measure performance.

Final compatibility checks: both existing booking regressions passed, including
host negotiation/cancellation and persisted promo-code visibility. All three
planner regressions passed, including guest sharing and host publication. Every
private workspace/API denies a different account in the account browser suite;
the empty-account state is also covered.

Lighthouse reports are in `/tmp/e11-f03-login-mobile/`,
`/tmp/e11-f03-details-mobile/`, `/tmp/e11-f03-review-desktop/`,
`/tmp/e11-f03-private-mobile-final/` and `/tmp/e11-f03-private-desktop-final/`.
The final private page has no document overflow at all four viewports and loads
no analytics script. DevTools reported no console warnings or errors on the
final private-page navigation. Native logout and verification focus corrections
are covered by the permanent browser suite. No merging, deployment, production-data change or customer contact is
part of this completion.
