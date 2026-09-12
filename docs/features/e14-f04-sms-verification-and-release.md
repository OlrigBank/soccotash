# E14-F04 — SMS verification and release

Part of [E14](epics/e14-f00-complete-provision-of-sms-option-to-send-verification-codes.md).

## Status

Local and hosted development acceptance are complete, including UK booking/sign-in
and Dutch mobile adding, sign-in, removal and UK-to-Dutch replacement. Production
code is deployed with public SMS disabled. Production SMS acceptance and Twilio
Primary Compliance Profile approval remain outstanding. The epic remains open.

## Local evidence

- Production build passed. Astro check reported zero errors/warnings, with the
  two existing administration hints.
- All 87 booking lifecycle test files passed. Direct provider tests cover UK
  eligibility, disabled configuration, leading-zero codes, original provider
  expiry, approved/expired checks, throttling, credentials and network errors.
- All 15 focused PostgreSQL account tests pass with disposable schemas, including the
  existing booking/account regressions, mobile linking/replacement/removal,
  session revocation, expired operations, conflict rejection, SMS-only protection,
  concurrent sends, provider-expiry bounds and SMS booking-to-sign-in ownership.
- All 28 Playwright account tests passed at 320×800, 390×844, 768×1024 and
  1440×900. The new journey uses real application endpoints and database writes,
  with local email delivery and a test-process-only Twilio transport. It adds and
  replaces SMS access, signs in through the replacement number, removes SMS
  access, checks validation, explicit sending, focus, overflow and origin rejection.
- Chrome DevTools inspected the rebuilt application at widths 320, 390, 768 and
  1440. Checked sign-in, empty-account entry, account details, unsupported-number
  validation, email approval, explicit SMS sending, successful linking and removal.
  Verified keyboard/Enter operation, visible skip-link focus, accessible structure
  and names, no document overflow, no unintended local overflow, expected API
  responses and private/no-store/no-referrer/no-index headers.
- Final DevTools console checks found no warnings/errors. Deliberate invalid input
  returned the expected HTTP 400 without a script exception.
- Final Lighthouse snapshots for sign-in and account management scored 100 in all
  reported categories. Reports: `/tmp/e14-signin-lighthouse-final/` and
  `/tmp/e14-account-lighthouse-final/`. These snapshots exclude performance. An
  earlier sign-in audit ran during test-server shutdown and could not fetch
  robots/llms resources; both checks passed with the stable server.

Browser testing found and fixed Enter submission and hidden-label visibility.
The fixtures intercept Twilio only inside `tests/support/booker-server.mjs` and
never forward SMS requests. No production bypass or real customer credential is
used. Synthetic mobile numbers in tests must never be used as live recipients.

## Remaining release gates

1. Separate Verify services and local credentials are now provisioned; see
   [E14-F01](e14-f01-twilio-sms-provisioning.md). Render configuration remains pending.
2. Run the read-only configuration check and confirm geographic/fraud settings.
3. Obtain explicit permission for the test recipients and messages; verify trial
   recipients in Twilio Console with owner participation.
4. Obtain deployment approval and prove delivery plus the account journeys on
   Render development with disposable fixtures.
5. Upgrade/complete Twilio onboarding before enabling SMS for ordinary bookers.
   A trial-only smoke result is not public availability evidence.
6. Obtain production deployment/data approval, perform the limited production
   smoke check and record sanitised evidence and the deployed revision.

No feature or epic closure should imply that these live checks have already passed.

## Render preflight — 12 September 2026

The owner confirmed the Render workspace. Read-only inspection confirmed that
`soccotash` tracks `development` and `olrigbankweb` tracks `main`, with automatic
deployment disabled on both. The development service currently runs revision
`3594ff4b5b7a4b21a9459e192f65820c97ab155e`.

The separate `soccotash-development-bookings` database is available. A read-only
query confirmed migration 060 is the latest applied migration and found no
accounts with multiple SMS identities, satisfying migration 061's uniqueness
preflight. The connector does not expose service environment values, so this
does not yet verify the development service's actual database connection.
No Render settings, deployment or hosted data were changed.

## Approved Render development deployment — 12 September 2026

The owner confirmed the development database connection and approved merging
PR #153, configuring Twilio and deploying `soccotash`. PR #153 merged as
`65b5eebfac32b654934f7f46935765db71b396d9`; all five PR CI checks passed.
The development environment update merged the three Twilio settings and
`BOOKER_SMS_ENABLED=true` into existing settings without replacing other keys.
Render automatically started deployment `dep-daii9v9594qs738slaj0` on that update;
no duplicate deployment was triggered. Render reports this revision live.

Read-only verification confirmed migration `061_booker_sms_management.sql` on
the development database. `/api/health/` returned HTTP 200 with application and
database status `ok`. Chrome DevTools confirmed the signed-out account route
redirects to sign-in preserving `/booking/account/` as the continuation target.
The sign-in response is private/no-store, no-referrer and noindex. No document
overflow appeared at actual viewport widths 390, 768 and 1440; the phone check
used device emulation because native window resizing clamps narrow widths.
No browser warnings/errors or Render error-level logs were found after release.

No additional SMS was sent during deployment verification. Hosted delivery and
authenticated account journeys still need controlled owner-approved tests.
Production configuration and deployment were not changed.

## Hosted booking-contact SMS proof — 12 September 2026

After the owner authorised the hosted test, Chrome DevTools exercised `/book/`
on the deployed development revision `65b5eebfac32b654934f7f46935765db71b396d9`.
The owner-controlled number was entered and SMS selected; the explicit
**Send SMS code** action requested delivery. The application reported the code
sent, and the development challenge record confirmed `delivered=true`.

The owner received the code. Entering it in the hosted UI succeeded on the first
attempt: the page displayed **Contact verified. You can continue.**, the SMS
booking grant was present, and the challenge was consumed. **Continue to review**
became enabled and opened the review step. No OTP is retained in this record.

The owner subsequently approved submission and its administrator notifications.
The labelled test request was submitted successfully and opened its private
booking page with an authenticated SMS account. After logout, requesting that
private URL correctly redirected to sign-in, preserving the continuation target.

An explicitly requested SMS sign-in code was delivered through the hosted
development service. The owner supplied the code, which succeeded on the first
attempt and restored access to the same test booking. The session endpoint
confirmed signed-in status and an SMS identity; the login challenge was delivered
and consumed with one attempt. No OTP is retained in this record.

The disposable request for 23–27 November 2026 was cancelled through its booker
workflow with an explicit test-cleanup reason. The application confirmed
cancellation and reported its notification sent. The test SMS account remains
available. Its Sign-in details page correctly explains that a verified email
is required to change SMS access and offers no removal of the sole identity.
Chrome DevTools reported no console errors or warnings on that page.

Hosted booking verification, submission, logout protection and subsequent SMS
sign-in now have live evidence. Email-backed mobile management and production
acceptance remain outstanding.

## Production release preparation — 12 September 2026

A read-only production database preflight found migration 060 and no accounts
with multiple SMS identities. Comparing `development` with `main` found only
E14 implementation changes awaiting promotion; the production-only commits were
earlier release merges with no additional file changes. Draft release PR #154
prepares this promotion. No production settings or deployment were changed.

Twilio now reports an active Full account. Hosted email-backed mobile-management
acceptance needs an owner-controlled email and another mobile number: the first
test number is already the sole identity of the SMS-only development account.
Do not bypass that identity protection or attach an unverified email to complete
the live acceptance checks.

## First authorised live development attempt

The owner confirmed Standard Fraud Guard protection on both services and supplied
an approved UK test recipient. One request was made through the application's
SMS adapter using the development Verify service. Twilio rejected it with HTTP 403,
error 21608 (trial recipient not verified); delivery and code approval did not occur.
No automatic retry was made. Public SMS remains disabled. The recipient must first
be verified in the trial account before another explicitly authorised test.
Full phone numbers, credentials and OTPs are excluded from this record.

## Successful live development-service smoke check

After completing trial recipient verification, the owner authorised one retry.
The application's SMS adapter submitted the request to the development Verify
service; Twilio accepted it. The owner received and supplied the six-digit code,
and the application's check adapter received an approved result from Twilio.
The temporary code file was removed after checking. No code or full recipient
number is retained in this feature record.

This proves real SMS delivery and provider approval through the application
adapter using the development service. It is not a hosted Render account-journey
test. Render development deployment/journeys and the production smoke check
remain outstanding. Public SMS remains disabled.

## UK and Netherlands scope extension — local evidence

The owner approved Dutch mobile support. Provider eligibility tests pass for +31
and 0031 mobile input, rejecting Dutch landlines, ambiguous Dutch local input and
unsupported countries. UK local-format support is retained. Astro check reports
zero errors/warnings (two existing hints); the production build passes.

All 28 account browser tests passed at 320, 390, 768 and 1440 widths. The mobile
management journey now replaces a UK number with a Dutch number, signs in using
the Dutch identity, then removes it. All provider traffic uses the non-forwarding
local fixture transport. Shared verification and account guidance explain +31.
The existing custom Contact verification panel and Sign-in details panel retain
native form controls; no new UI pattern was introduced.

Chrome DevTools inspected the rebuilt account guidance at 390, 768 and 1440
widths without document overflow. A Dutch landline returned the expected HTTP
400 and moved visible focus to the validation message; no script errors were
observed. Lighthouse snapshot scored 100 in all reported categories, excluding
performance (`/tmp/e14-nl-lighthouse/`). Live Dutch delivery remains pending.

## Hosted Dutch mobile linking — 12 September 2026

PR #155 merged as `841abb898d9bcb1447211c60ea9909d4b42a2614` and was deployed
to development. All five checks passed after correcting randomly generated
Dutch fixture numbers to use a valid mobile range.

Hosted Dutch sends initially failed with Twilio 21608. The owner obtained the
exact code from a controlled Render Shell diagnostic. Twilio documents this as
an unverified-recipient restriction on trial accounts or upgraded accounts
without an approved Primary Compliance Profile. An active Full account alone
therefore does not establish public messaging readiness. Reapplying the working
local development credentials and restarting did not resolve this restriction;
the earlier local diagnostic success did not establish hosted acceptance.

After the owner added the Dutch number as a verified recipient, a fresh hosted
mobile-add operation passed email verification, sent its SMS successfully and
accepted the owner-supplied SMS code. The account page returned `updated=1`;
the session confirmed both the original email identity and the Dutch SMS identity.
No codes or full contact details are retained in this record.

The owner then completed hosted Dutch SMS sign-in after logout. The resulting
session belonged to the same email-backed account and retained both identities.
A fresh email code authorised removal of the Dutch SMS identity. The account
page again returned `updated=1`, retaining email and signed-in status. A read-only
database check confirmed one active session, zero SMS identities on that account
and zero usable outstanding Dutch SMS challenges. The account is left email-only.

Hosted add, Dutch sign-in and removal now pass. Live replacement still requires
the UK number to be released from its disposable SMS-only test account before it
can join this email-backed account; do not bypass the cross-account identity
constraint. Automated UK-to-Dutch replacement already passes. Production
acceptance and approved Primary Compliance Profile readiness remain outstanding.

## Authorised production deployment — 12 September 2026

The owner requested production deployment. PR #154 had already been merged;
PR #156 promoted the Dutch-support follow-up after its checks passed. Production
`olrigbankweb` now runs `129e420ad0d769e59a4701aa4f29001bc9ecb707`, deployment
`dep-daijq49594qs73923ibg`, reported live by Render. The environment update set
`BOOKER_SMS_ENABLED=false` and selected the separate production Verify service,
merging those values into the existing environment without replacing other keys.

Production migration 061 is applied. On `https://olrig-bank.com`, health returned
HTTP 200 with application/database status `ok`. The signed-out account route
redirected to sign-in preserving the continuation target. Responses retained
private/no-store, no-referrer and noindex headers. Chrome DevTools checked actual
390, 768 and 1440 widths without document overflow or initial console errors.
A controlled disabled-SMS request returned the expected HTTP 503/email fallback;
no production SMS was sent. Render error-level logs were empty after deployment.

This is a successful code deployment with public SMS disabled, not completed
production SMS acceptance. Primary Compliance Profile approval, live development
replacement and controlled production SMS verification remain outstanding.
The UK number is currently linked to the owner's email-backed development account;
replacement was deferred by the five-email-codes-per-hour limit. Its old cancelled
disposable booking was preserved when the owner released the former SMS identity.

## Hosted UK-to-Dutch replacement acceptance

After the email rate limit cleared, the owner signed in to the email-backed
account and started replacement of the verified UK mobile with the Dutch mobile.
Fresh email verification passed. Before SMS approval, the session still exposed
the UK identity, confirming that pending replacement preserved the old method.
The hosted SMS request then succeeded and the owner supplied its code.

The account returned `updated=1` with the Dutch identity, no UK identity and the
original email identity preserved. Read-only database verification confirmed one
active account session, zero usable old-UK challenges and zero usable old-UK
verification grants. This completes the remaining hosted development replacement
check. No codes or full contact details are retained here. The development account
is left with email and Dutch SMS access. Production SMS remains disabled pending
provider readiness and its controlled live acceptance check.
