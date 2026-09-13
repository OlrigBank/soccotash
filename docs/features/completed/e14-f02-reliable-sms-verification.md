# E14-F02 — Reliable SMS booking verification and sign-in

Part of [E14](../epics/completed/e14-f00-complete-provision-of-sms-option-to-send-verification-codes.md).

## Status and behaviour

Completed and closed with owner approval on 13 September 2026.

Implemented and verified locally and on hosted development. The controlled
production SMS verification and fresh sign-in checks passed on 13 September 2026;
see E14-F04 for evidence and the API-only production verification limitation.

The existing booking/sign-in endpoints retain their contracts. SMS requires an
explicit Send SMS code action; contact blur and channel selection do not send a
text. Email keeps its existing behaviour. Server-side phone metadata validates
UK and Dutch mobile eligibility, including rejection of other countries, landline and Crown
Dependency destinations, without changing ordinary booking contact storage.

`BOOKER_SMS_ENABLED=true` plus complete credentials is required for sending and
checking SMS. Twilio Verify owns SMS codes. SMS challenge expiry is capped at the
provider's original creation time plus ten minutes. Resend copy does not promise
a renewed validity period. Login responses retain uniform expiry metadata and
non-disclosing messages for unknown contacts.

Expired verification checks return an invalid/expired result; throttling and
configuration/outage failures have safe messages and sanitised logs. Existing
request and attempt limits, browser binding, one-use grants and booking ownership
remain enforced. Identity locks coordinate verification with mobile changes.

## UI patterns

- **Contact verification panel** — custom interaction using native controls,
  now with explicit SMS sending.
- **Verification code field** — native text input with numeric keyboard and
  one-time-code autocomplete.

See [E14-F04](e14-f04-sms-verification-and-release.md) for test evidence and limitations.
