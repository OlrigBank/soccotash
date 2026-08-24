# Proposed PR #106 — Booking Party Capture and Assessment

## Status

- Parent branch: `agent/managing-occupancy-epic`
- Feature branch: `agent/pr-106-booking-party-capture`
- Intended merge target: `agent/managing-occupancy-epic`
- Current status: implemented and verified; ready for review
- Database changes: yes
- Public interface changes: yes

## Objective

Replace the ambiguous guest total with an accessible party-composition journey
and classify each submitted request against its published occupancy policy.

## Implementation

1. Replace **Guests** with adult, child and infant count controls and retain the
   pet count.
2. Explain age categories using age on the arrival date without collecting
   dates of birth.
3. Reassess the party when the stay arrangement or any count changes.
4. Show the standard capacity and a plain-language summary before submission.
5. Explain when a party becomes bespoke without presenting that outcome as a
   rejection.
6. Permit `host_decision_required` requests to be submitted for host review.
7. Snapshot policy ID, version, assessment input, outcome, reasons and time on
   the booking in the same transaction as submission.
8. Preserve the current rule that every submission proceeds to administrator
   review and an offer.

## Acceptance criteria

- At least one adult is required on client and server.
- Changing dates does not silently change the meaning of an age category.
- Standard and bespoke summaries are clear at mobile widths.
- Exceeding a published standard capacity does not automatically reject the
  request.
- Anything requiring host agreement is stored as bespoke.
- Later policy publication cannot reinterpret a submitted request.

## Out of scope

- Automatically confirming a standard request.
- Optional occupant names and individual pet records.
- Selecting spaces for a bespoke offer.

## Implemented outcome

- The public form now captures adults, children and infants separately and
  explains that categories use age on arrival. It retains pets and presents a
  live plain-language party summary.
- Standard listing capacities no longer clamp or reject larger requests. The
  published occupancy evaluator classifies them for bespoke or host-decision
  review.
- Quote review and final submission both reassess the current party. A party
  requiring agreement suppresses automatic pricing and explains that Olrig Bank
  will prepare the arrangement and offer.
- Where no policy has yet been published, the request remains possible and is
  safely classified as requiring a host decision.
- Migration `048_booking_occupancy_assessment.sql` adds the immutable policy ID,
  version, assessment input, outcome, reasons and assessment time snapshot.
- Booking creation records that snapshot in the same insert as the request.
  Publishing a later policy does not reinterpret an existing booking.
- Every booking continues through the existing administrator review and offer
  workflow.

## Verification

- Booking lifecycle tests: 56 passed.
- PostgreSQL integration tests: 15 passed, including a booking snapshot that
  remains bound to an archived policy after replacement publication.
- Astro check: passed with no errors.
- Production build: passed.
- `git diff --check`: passed.
