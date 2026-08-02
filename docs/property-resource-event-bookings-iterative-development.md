# PR #44 iterative development and acceptance testing

## Purpose

This document records how the property-resource and Bespoke-stay work on
PR #44 was developed and tested. It is intended to preserve the working method
used on branch `agent/property-resource-event-bookings`, so that later work can
continue without repeating already completed investigation or confusing a
browser-control problem with an application defect.

PR #44 remained a draft throughout this work. The feature branch was tested
before merge; production was not changed.

## Development loop

The branch was developed in deliberately small iterations:

1. Agree one narrowly defined behaviour or correction.
2. Inspect the existing booking lifecycle before changing it.
3. Implement the smallest coherent source and test change.
4. Run the booking-lifecycle tests, generated-document consistency check,
   Astro analysis, and production build.
5. Commit and push the change to the existing PR #44 branch.
6. Redeploy that branch to the controlled test environment.
7. Refresh the Cloud Browser page from the server and test the changed step.
8. Record the next observed issue and repeat.

The normal validation commands were:

```bash
npm run test:booking-lifecycle
npm run check:booking-lifecycle-docs
npm run check
npm run build
```

The final iterations passed 45 booking-lifecycle tests as well as the
documentation, Astro, and production-build checks.

## Why small iterations were used

The Bespoke-stay workflow touches public availability, booking creation,
administrator assignment, offer pricing, calendar behaviour, payments, and
Booker/admin messaging. Testing one transition at a time made it possible to:

- separate policy decisions from implementation defects;
- identify misleading wording while the relevant state was visible;
- validate server-side rules as well as browser controls;
- redeploy and retest a focused change without reopening completed work; and
- preserve a usable booking record across the complete lifecycle.

## Controlled test setup

Testing used a branch deployment reached through a temporary Cloudflare
tunnel and a shared Cloud Browser. The administrator signed in directly in the
browser; credentials were never placed in chat or committed to the repository.

A clearly disposable request was used:

- Name: `Bespoke Request Acceptance Test 2026-08-02`
- Dates: 13-14 September 2026
- Requested stay: one night
- Assigned accommodation during testing: Cottage
- Disposable offer: £125

The request deliberately had no email address, telephone number, or WhatsApp
consent. This allowed offer, payment, and conversation behaviour to be tested
without sending an external email or WhatsApp message.

## Browser procedure

Cloud Browser state was treated as potentially stale after every deployment or
navigation. Before deciding whether a change had failed, the tester:

1. Reloaded the page from the server rather than trusting an already-open tab.
2. Confirmed that the expected new label, field, or form action was present.
3. Opened the Reservation drawer explicitly after a reload.
4. Confirmed that the intended control was visible and held the expected value.
5. Submitted once and verified the persisted booking state after navigation or
   another reload.

This procedure matters because the Cloud Browser sometimes retained old page
markup, became slow, duplicated input, or matched controls hidden inside a
closed drawer. One apparent accommodation-assignment failure was ultimately a
browser interaction failure: the hidden control had been targeted and no POST
request had been sent. Once the drawer was explicitly opened, Cottage
assignment succeeded and persisted. No further mutation rewrite was required.

If input begins repeating or the browser becomes unresponsive, stop typing,
refresh the page, verify that sensitive fields are empty, and resume only once
the current state is visible. Chrome proved more reliable than Firefox for
shared login input during this cycle.

## Iterations completed

The principal iterations were:

1. Introduce a Booker-defined use of the property as a non-blocking Bespoke
   request.
2. Permit one-night Bespoke requests while retaining the two-night minimum for
   Cottage, Main House, and whole-property stays.
3. Rename `Bespoke arrangement` to `Bespoke stay` and correct singular-night
   wording.
4. Remove automatic provisional pricing from Bespoke requests and display
   `Price to be agreed` instead.
5. Correct Booker, Olrig Bot, calendar, table, and administrator wording so a
   pending Bespoke request does not imply that dates are held or a price was
   calculated.
6. Make the accommodation selector start without a default and add explicit
   assignment outcomes through a dedicated POST endpoint.
7. Verify that assigning Cottage changes the non-blocking request into a
   provisionally reserved, administrator-priced stay.
8. Require a genuinely positive offer total on both client and server. Missing,
   malformed, zero, negative, and net-zero offers are rejected.
9. Show `Not yet set` rather than £0.00 before a valid offer price exists.
10. Complete the end-to-end lifecycle through offer, acceptance, payment
    reporting, administrator verification, and confirmation.

## End-to-end acceptance result

The controlled booking passed these transitions:

| Step | Result |
| --- | --- |
| Submit one-night Bespoke request | Created as `pending`, with no price and without blocking availability |
| Assign Cottage | Persisted; pricing and offer controls became available; dates became provisionally reserved |
| Publish £125 offer | Status changed to `offered`; Booker saw the breakdown and expiry |
| Accept offer | Status changed to `payment_pending` |
| Calculate payment | Full £125 required because arrival was within 42 days |
| Report manual transfer | Status changed to `payment_reported`; payment history recorded the report |
| Verify transfer in administration | Payment marked `verified`; booking changed to `confirmed` |
| Confirm Booker result | Booker page showed the booking as confirmed and fully paid |

No real payment was initiated. The manual-transfer workflow was exercised by
recording a disposable reported payment and then administratively verifying it.

## Issues recorded for later review

During the accepted-offer stage, two administrator display observations were
recorded but deliberately left outside the immediate test step:

- an offer-published banner remained visible after acceptance; and
- a price section displayed `Price to be agreed` even though the accepted £125
  offer remained correctly recorded in offer history.

These observations should be checked against the current branch before being
treated as open defects, because later iterations or refreshed browser state
may have changed what is displayed.

## Rules for continuing the branch

- Continue from the current PR #44 head; do not restart the feature from an
  earlier branch or recreate completed iterations.
- Keep PR #44 draft until its remaining review and acceptance work is complete.
- Use disposable, unmistakably named data and avoid real contact details.
- Never commit private Booker links, credentials, tunnel details, or unredacted
  sensitive screenshots.
- Re-run all four validation commands after each code iteration.
- Redeploy the feature branch and force a fresh page load before browser
  acceptance testing.
- Verify persisted server state, not only the visible value of a browser
  control.
- Distinguish confirmed application defects from Cloud Browser cache, hidden
  drawer, timeout, or duplicated-input failures before changing code.
- Do not change production as part of branch acceptance testing.
