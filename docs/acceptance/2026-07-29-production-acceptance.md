# Production acceptance record — 29 July 2026

## Scope

Priority 1: prove and protect the production service.

The default automated baseline was read-only. The booking-management journey
used clearly labelled, contact-free test records so no real Booker could be
notified.

## Automated baseline

- Result: 13/13 checks passed.
- Production origin: `https://olrig-bank.com`
- Development origin: `https://soccotash.onrender.com`
- Production and development both returned healthy database-backed responses.

## Controlled booking-management journey

Passed:

- public availability and server-side pricing;
- creation of a provisional booking;
- private Booker page, recorded stay and price;
- Booker-to-administrator opening message;
- administrator booking lookup and reservation details;
- administrator-to-Booker message without email notification;
- administrator preview of the Booker page;
- publication and preview of a £940 offer without email delivery.

Test records retained for completion and cleanup:

- `56b40d46…` — 2–4 November 2026;
- `5f18fc04…` — 4–6 October 2026.

## Failure PA-2026-07-29-01

**Status:** fix implemented; deployment and production retest pending.

After publishing the offer, the administrator could preview the Booker page
but could not retrieve the genuine private Booker management link. The preview
deliberately disables Booker response controls, so the acceptance journey
could not safely test offer acceptance.

Root cause: the admin booking query returned the existing customer access
token, but the booking-management page exposed only the token-free
administrator preview route.

Fix: add authenticated **Open Booker page** and **Copy Booker link** controls.
The URL is built from `BOOKING_PUBLIC_URL` and the existing access token. No
new token, public endpoint, or database field is introduced.

Retest required:

- copy the private Booker link from administration;
- open it in an unauthenticated/incognito browser;
- verify the active offer and response controls;
- accept the offer;
- verify confirmed status, messages and calendar effect;
- delete both acceptance-test records when the cycle is complete.

## Remaining Priority 1 work

- complete the repaired booking-management journey;
- prove production/development data isolation;
- perform the backup-and-restore drill;
- verify Render health, restart and outage detection;
- complete the recovery-dependency runbook;
- review and clear recurring production log errors and warnings.
