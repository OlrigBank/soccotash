# E14-F00 — Complete SMS verification and booking account access

## Status

Implementation and local verification are complete on `agent/e14-sms-verification`.
Separate Twilio Verify services are provisioned. Hosted development booking,
sign-in and mobile-management journeys have passed with owner-controlled UK and
Dutch numbers. Production code is deployed with SMS disabled; production SMS
acceptance and provider readiness remain outstanding. The epic remains open.

## Outcome

Complete the existing Twilio Verify integration so bookers can receive six-digit
SMS codes to verify booking requests and sign in. Support UK and Dutch mobile numbers, alongside existing email verification.

Allow email-backed accounts to add, replace and remove a verified SMS sign-in
number. Completion requires controlled live delivery evidence on both Render
development and production.

## Existing foundation

[E11-F03 — Verify bookers and introduce private accounts](../completed/e11-f03-verify-bookers-and-private-accounts.md)
introduced email/SMS verification, private accounts, browser-bound challenges,
verification grants and sessions. Its closure explicitly retained the limitation
that real SMS delivery and hosted configuration had not been verified.

The application already calls Twilio Verify, offers SMS in the contact selector,
and checks six-digit codes. SMS sign-in currently requires an existing SMS identity
or an eligible unclaimed booking. An unverified mobile number recorded on an
email-backed booking does not grant account access.

This epic completes that foundation and introduces verified mobile management;
it does not replace the account model or infer ownership from booking contacts.

## Feature stages

### E14-F01 — Twilio provisioning and operational controls

- Reuse the existing Twilio trial account and guide the owner through creating
  separate development and production Verify services.
- Configure the Olrig Bank service name, six-digit codes, ten-minute validity,
  UK and Netherlands geographic permissions and fraud protection.
- Supply credentials through the existing `TWILIO_ACCOUNT_SID`,
  `TWILIO_AUTH_TOKEN` and `TWILIO_VERIFY_SERVICE_SID` settings. Keep secrets out
  of source, browser responses and verification evidence.
- Add an explicit SMS enable/disable setting, defaulting to disabled until
  configuration is validated. Email remains available.
- Document onboarding, configuration validation, provider diagnostics, usage
  monitoring and disabling SMS during an incident.

Acceptance: both environments have a documented configuration procedure and
SMS can be disabled without breaking email verification. Live activation is
subject to the release gates below.

### E14-F02 — Reliable SMS booking verification and sign-in

- Retain Twilio Verify for SMS code generation and approval, using the existing
  request-code and verify-code endpoints.
- Accept UK mobile input in domestic or international format and Dutch mobile
  input with +31 or 0031, normalise it
  consistently, and reject unsupported destinations before contacting Twilio.
  Restrict SMS eligibility without restricting ordinary booking contact details.
- Require an explicit **Send SMS code** action. Selecting SMS, editing a number
  or leaving a field must not send a text. Preserve existing email behaviour.
- Preserve browser and purpose binding, single-use verification, booking
  ownership checks and non-disclosing sign-in responses.
- Retain the existing limits: 60 seconds between requests, five requests per
  destination per hour, twenty per IP per hour and five code attempts per
  challenge. Enforce limits across instances and verification purposes.
- Distinguish wrong/expired codes, provider throttling, configuration failures
  and temporary outages. Handle Twilio's expired/approved verification `404`
  responses appropriately rather than treating every provider error as an outage.
- Align resend handling with Twilio's token lifetime. Resending must not promise
  a fresh ten-minute validity window when the provider retains the original token.
- Record sanitised operational outcomes without codes, credentials or full
  contact details.

Acceptance: an eligible booker can explicitly request a text, verify a booking
request and subsequently sign in using SMS. Failure and retry states remain
recoverable without weakening verification or revealing account existence.

Provider references:

- [Twilio verification checks](https://www.twilio.com/docs/verify/api/verification-check)
- [Twilio rate limits and timeouts](https://www.twilio.com/docs/verify/api/rate-limits-and-timeouts)
- [Twilio Verify service configuration](https://www.twilio.com/docs/verify/api/service)

### E14-F03 — Manage SMS account access

- Add an authenticated **Sign-in details** page at `/booking/account/`, linked
  from the shared booker layout and available even when the account has no
  accessible bookings.
- Show verified sign-in contacts and let email-backed accounts manage one SMS
  number.
- Require a fresh code to an email identity already attached to the account
  before adding, replacing or removing SMS access, even with an existing session.
- Adding or replacing also requires a successful SMS code to the proposed
  number. Keep the old number active until replacement succeeds.
- Bind the management operation to the account, current session, browser,
  intended action and proposed number. Authorisation expires after ten minutes
  and is single-use.
- Reject numbers already linked to another account without revealing that
  account or merging accounts.
- Apply changes transactionally. On replacement/removal, invalidate outstanding
  SMS challenges for the removed identity, revoke other account sessions and
  rotate the current session.
- Preserve booking ownership and booking contact information. Managing sign-in
  details must not transfer or claim bookings.
- SMS-only accounts retain existing sign-in capability. Adding email and
  recovering a lost sole sign-in number are outside this epic.

Acceptance: an email-account holder can securely add, replace and remove SMS
access. Failed or abandoned changes preserve the existing sign-in methods and
booking ownership. A number belonging to another account cannot be taken over.

### E14-F04 — Verification and release

- Complete automated and rebuilt-application browser checks before deployment.
- Prove delivery, booking verification, subsequent SMS sign-in and mobile
  management on development using owner-approved test numbers.
- After explicit deployment approval, perform a limited production smoke check
  with approved fixtures and numbers.
- Record application revision, environment, sanitised outcomes, configuration
  checks and remaining limitations. Keep the epic open until both environments
  pass.

Acceptance: development journey evidence and production smoke evidence show
real delivery and successful verification without contacting customers or
exposing credentials.

## Interfaces and storage

- Preserve existing booking/login contracts for
  `POST /api/booker/request-code/`, `POST /api/booker/verify-code/` and
  `GET /api/booker/session/`.
- Add dedicated authenticated account-management request/check endpoints for
  email re-verification and SMS changes. Never allow client-supplied account
  identifiers to select the target account.
- Add purpose-specific challenge and management-operation storage through an
  additive migration. Reuse verified identities and existing request limits.
- Enforce one SMS identity per account and global number uniqueness, including
  concurrent requests. Inspect existing data before adding constraints; do not
  silently remove conflicting identities.
- Extend authentication cleanup to expired management records.
- Retain same-origin mutation checks, private/no-store responses and secure
  session-cookie handling for the new account-management interfaces.

## UI patterns

- **Contact verification panel** — existing custom interaction using native
  controls; SMS sending becomes explicit.
- **Verification code field** — native text input with numeric keyboard and
  one-time-code autocomplete.
- **Sign-in details panel** — custom account contact display and management
  actions.
- **Verified mobile change flow** — custom sequential email/SMS verification
  using native forms.

## Verification requirements

- Cover SMS success, leading-zero codes, incorrect/expired codes, resend
  behaviour, exhausted attempts, provider errors, unsupported destinations and
  disabled configuration.
- Verify unknown-account responses, cross-browser/purpose rejection, replay
  prevention and concurrent send limits.
- Cover adding, replacing and removing numbers; expired email authorisation;
  identity conflicts; concurrent changes; session revocation; and unchanged
  booking ownership.
- Confirm no SMS request occurs automatically and email verification remains
  functional.
- Use mocked provider responses for automated tests, with no production
  authentication bypass. Exercise persistence and transaction behaviour through
  disposable database fixtures.
- Inspect the rebuilt application with Chrome DevTools at 320, 390, 768 and
  1440 pixel widths. Check keyboard use, visible focus, accessible names and
  structure, document/local overflow, console/network behaviour and success,
  empty, validation and continuation states.
- Run Lighthouse on sign-in and account management, investigate applicable
  failures and repeat after corrections. Add permanent Playwright coverage for
  the important journeys; Lighthouse alone is not sufficient evidence.
- Never use real customer credentials or contact customers during verification.
  Record tools, viewports, states, findings and limitations in the feature records.

## Scope decisions and release gates

- Email remains preferred when both booking contacts are supplied.
- SMS is an alternative passwordless sign-in method, not mandatory two-factor
  authentication.
- Account merging, SMS to countries other than the UK and Netherlands, marketing, booking notification texts and
  WhatsApp changes are excluded.
- Mobile management is limited to email-backed accounts; an SMS-only account
  must not be allowed to remove its sole sign-in identity.
- Implementation may proceed autonomously on the task branch. Merging,
  deployment and production-data changes require explicit owner approval.
- Twilio Verify service setup and owner-approved test numbers are release prerequisites.
  Obtain explicit authorisation for controlled live test messages before sending
  them. No live completion may be claimed until the required approvals and both
  environment checks are complete.

## Implementation records

- [E14-F01 — Twilio SMS provisioning](../e14-f01-twilio-sms-provisioning.md)
- [E14-F02 — Reliable SMS verification](../e14-f02-reliable-sms-verification.md)
- [E14-F03 — Manage SMS account access](../e14-f03-manage-sms-account-access.md)
- [E14-F04 — Verification and release](../e14-f04-sms-verification-and-release.md)

## Scope extension — UK and Netherlands

The owner approved Dutch mobile support to complete live replacement testing.
UK local-format input remains supported; Dutch input requires +31 or 0031.
Both countries require valid mobile numbers. Landlines, Crown Dependencies and
other countries remain unsupported. Enable UK and Netherlands Verify geographic
permissions with fraud protection; disable other destinations. This supersedes
the earlier UK-only release gate. Re-run account browser coverage with a Dutch
replacement number before deploying the extension.
