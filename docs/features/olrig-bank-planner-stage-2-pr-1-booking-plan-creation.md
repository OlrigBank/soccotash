# Proposed PR — Stage 2.1: Booking-linked planner creation

## Status

- Epic: [Olrig Bank Planner](./epics/olrig-bank-planner-epic.md)
- Target branch: `development`
- Depends on: Stage 1.6

## Objective

Establish the private booking-linked planner aggregate and allow either an
administrator or the authorised Booker to create one empty plan for an eligible
confirmed booking.

## Scope

- Add participant ownership records without introducing invitations or editing permissions yet.
- Create a private `booking_linked` plan transactionally from the booking dates and Booker identity.
- Restrict creation to confirmed or legacy-approved bookings.
- Reuse the existing administrator session and private Booker booking credential.
- Enforce one plan per booking at both service and database boundaries.
- Record the Booker owner, initial planner revision and booking activity atomically.
- Add creation and empty-state entry points to administrator and Booker booking pages.
- Return non-disclosing failures for missing bookings and mismatched Booker credentials.

## Acceptance criteria

- An administrator can create an empty planner for a confirmed booking.
- The authorised Booker can create the same planner from their private booking page.
- The plan inherits the booking dates, is private and identifies the Booker as owner.
- Pending, cancelled and otherwise ineligible bookings cannot create a planner.
- A credential for one booking cannot create a planner for another booking.
- Concurrent or repeated creation cannot produce duplicate planners.
- Planner revision history and booking activity identify the creation actor.
- Existing booking, example-planner, Local Guide and payment behaviour remains intact.

## Out of scope

- Copying an example plan.
- Editing booking-linked days or items.
- Inviting additional participants or assigning permissions.
- Guest contribution consent and moderation.
- Guest printable or shareable views.
