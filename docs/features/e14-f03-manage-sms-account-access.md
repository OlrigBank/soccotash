# E14-F03 — Manage SMS account access

Part of [E14](epics/e14-f00-complete-provision-of-sms-option-to-send-verification-codes.md).

## Status and behaviour

Implemented locally on `agent/e14-sms-verification`; live acceptance remains open.

The shared booking-account menu links to `/booking/account/`, including for
accounts with no accessible bookings. Email-backed accounts can add, replace or
remove a mobile sign-in identity. Every operation first verifies the account's
existing email; adding/replacing then explicitly sends and checks an SMS code.
The original number stays active until replacement succeeds. SMS-only accounts
cannot remove their sole sign-in method.

Operations are bound to the account, session hash, browser, action and proposed
number, last ten minutes and are single-use. No client-selected account ID is
trusted. Conflicting number ownership fails without merging or transferring
accounts. Transactions and identity locks coordinate concurrent verification and
changes. Replacement/removal invalidate old-number challenges and grants, revoke
account sessions and issue a fresh current session. Booking ownership, claim
contacts and booking contact details are unchanged.

Migration 061 adds management operations, management-specific challenge purposes
and a partial unique index enforcing at most one SMS identity per account. It
fails rather than resolving pre-existing identity conflicts destructively.

## Interface

`POST /api/booker/mobile/` requires an authenticated session, same-origin JSON
and the browser cookie. All responses inherit private/no-store/no-referrer headers.

- `step: start`, `action: add | replace | remove`, `identifier` (except removal)
  creates an operation and requests its email code.
- `step: send`, `operationId` resends the current step or explicitly sends SMS
  after email approval.
- `step: check`, `operationId`, `challengeId`, `code` verifies the current step.
  The response identifies `nextStep: sms | complete`.
- Send responses include `operationId`, `challengeId`, `channel`, retry delay,
  expiry and a message. Errors carry a safe message and applicable retry delay.

## UI patterns and findings

- **Sign-in details panel** — custom verified-contact display and management actions.
- **Verified mobile change flow** — custom sequence using native forms, select,
  buttons and code input.

Browser verification corrected Enter submission after disabling the initial
fieldset and a label style overriding native hidden state. Errors receive focus;
email approval advances focus to Send SMS code; successful delivery focuses code
entry. Permanent browser coverage checks the full add/replace/remove journey.

See [E14-F04](e14-f04-sms-verification-and-release.md) for evidence and release gates.
