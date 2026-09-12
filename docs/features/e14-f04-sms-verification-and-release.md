# E14-F04 — SMS verification and release

Part of [E14](epics/e14-f00-complete-provision-of-sms-option-to-send-verification-codes.md).

## Status

Local verification complete on 12 September 2026. Live development and production
acceptance remain pending. A live development-service SMS was delivered and approved after the owner verified
the trial recipient; see the evidence below. The approved development deployment
is now live. Production remains unchanged. The epic must remain open.

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
