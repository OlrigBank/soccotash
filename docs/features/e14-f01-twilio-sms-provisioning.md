# E14-F01 — Twilio SMS provisioning

Part of [E14](epics/e14-f00-complete-provision-of-sms-option-to-send-verification-codes.md).

## Status

Implementation in progress on `agent/e14-sms-verification`. The owner confirmed
an existing Twilio free-trial account on 12 September 2026. Credentials were supplied through the ignored local `.env` and authenticated
successfully. Separate development and production Verify services have been created
and read back with six-digit codes and the do-not-share warning enabled. A controlled development-service SMS has now been delivered and approved; see
[E14-F04](e14-f04-sms-verification-and-release.md).

## Configuration

Use the existing account; do not create another account. Create separate Verify
services for development and production in Twilio Console, with the friendly name
**Olrig Bank**, six-digit codes, default ten-minute validity, UK-only geographic
permissions and fraud protection enabled. Do not configure a longer token lifetime:
application expiry is deliberately capped at ten minutes from provider creation.

Supply these values in the local ignored `.env` or the appropriate Render service's
Environment settings. Never paste auth tokens into chat or commit them.

| Setting | Value |
| --- | --- |
| `TWILIO_ACCOUNT_SID` | Existing account SID |
| `TWILIO_AUTH_TOKEN` | Primary auth token, supplied as a secret |
| `TWILIO_VERIFY_SERVICE_SID` | Environment-specific Verify service SID (`VA…`) |
| `BOOKER_VERIFICATION_SECRET` | Existing independent secret, at least 32 characters |
| `BOOKER_SMS_ENABLED` | `false` until validation; explicitly `true` to enable |

Absent or non-`true` enablement is disabled. Disabling SMS stops sending and SMS
checks; email and removal of an existing SMS identity remain available.

Render's `sync: false` declarations prompt only at initial creation. Existing
services need explicit Dashboard configuration. Save without deployment while
preparing credentials; obtain deployment approval before activating a release.

From `site/`, with environment values loaded, run `npm run sms:check`. It performs
one read-only Verify service request and confirms credentials and six-digit code
length. It sends no message and does not print account identifiers or secrets.
Verify geographic permissions, fraud protection and default validity manually;
the command does not claim to verify them.

## Trial and live release

[Twilio Verify trial guidance](https://www.twilio.com/docs/verify/quickstarts)
requires verified recipients during the trial. Register only owner-approved test
numbers in Console. This registration can itself send a verification message and
requires the owner's participation. Public use requires upgrading the account
and completing Twilio's applicable onboarding/compliance profile requirements.
An approved-number production smoke test on a trial account does not prove public
availability; keep public SMS disabled until the account is ready for ordinary
bookers.

Before each live test, confirm the recipient, environment and permission to send.
Use disposable account/booking fixtures, no customer credentials, and no recordings
of OTP entry. Record the revision, service configuration checks and delivery/approval
outcome without codes, auth tokens or full numbers. Test development first and
obtain deployment/production-data approval before the production smoke check.

## Operation and rollback

Monitor Twilio Verify delivery and approval failures, blocked traffic and usage
in Console. Application logs emit only the `booker_sms_provider_failure` event and
its category (`expired`, `limited`, `configuration`, `unavailable`). No raw provider
error body is logged. Investigate repeated configuration errors before enabling;
check service credentials, UK permissions and trial recipient eligibility.

Use existing destination/IP request limits plus Twilio fraud protection. Review
account usage and billing alerts in Twilio Console before public activation. An
alert is not a hard spending cap. If unexpected usage or delivery failures occur,
set `BOOKER_SMS_ENABLED=false` and apply the environment change through the approved
release process. Keep email available. Never roll back to old bearer-link code.

Migration 061 is additive apart from strengthening identity uniqueness. It fails
if an account already has multiple SMS identities rather than deleting data.
Investigate conflicts explicitly before release. Normal authentication pruning now
also removes expired mobile-management operations after the existing grace period.

## Provisioning evidence — 12 September 2026

The authenticated service list was empty before provisioning. Created two services
with friendly name **Olrig Bank**, `CodeLength=6` and
`DoNotShareWarningEnabled=true`, then independently fetched each configuration.

| Environment | Verify service SID | Local configuration |
| --- | --- | --- |
| Development | `VAcd7478e4b883a90adaf04c330f66d183` | `TWILIO_VERIFY_SERVICE_SID` |
| Production | `VA978acb02531b9a31341f4ad11ea74fe7` | `TWILIO_VERIFY_PRODUCTION_SERVICE_SID` |

The production key is a local provisioning reference only. The production Render
service must use its value as `TWILIO_VERIFY_SERVICE_SID`; application code does
not read `TWILIO_VERIFY_PRODUCTION_SERVICE_SID`. No Render settings were changed.
`BOOKER_SMS_ENABLED` remains false locally.

No connected browser was available for Console inspection. Confirm UK SMS is set
to **Monitor all traffic for blocking fraud**, other countries are disabled, and
Fraud Guard is enabled for both services. Fraud Guard is enabled by default
according to Twilio documentation, but its actual Console state has not been
independently inspected. Also confirm the default ten-minute validity before live
acceptance. See [Verify Geo Permissions](https://www.twilio.com/docs/verify/preventing-toll-fraud/verify-geo-permissions)
and [Fraud Guard](https://www.twilio.com/docs/verify/preventing-toll-fraud/sms-fraud-guard).

The owner subsequently confirmed Standard Fraud Guard protection on both services
and completed verification of the authorised trial recipient. UK permission was
configured with owner participation; disabling all non-UK destinations still
requires explicit confirmation before public activation.

## Release readiness update — 12 September 2026

An authenticated read-only account check now reports `type=Full` and
`status=active`; the earlier trial-account restriction is no longer the recorded
account status. This does not independently confirm every Console onboarding,
geographic-permission or usage-alert setting. UK-only permissions still require
confirmation. Development Render configuration and hosted SMS booking/sign-in
proof are recorded in E14-F04; production configuration remains pending.
