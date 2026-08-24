# Proposed PR #110 — Bespoke Offer Allocation and Conflicts

## Status

- Parent branch: `agent/managing-occupancy-epic`
- Feature branch: `agent/pr-110-bespoke-offer-allocation`
- Intended merge target: `agent/managing-occupancy-epic`
- Database changes: yes
- Public interface changes: private offer details

## Objective

Allow the host to attach a concrete accommodation allocation to a bespoke offer
and prevent accepted arrangements from conflicting with other use.

## Implementation

1. Let an administrator select a standard bundle or a valid combination of
   resources while preparing a bespoke offer.
2. Record approved alternative sleeping arrangements and explanatory notes
   separately from the original requested occupancy.
3. Validate that the allocation can plausibly serve the offered party while
   leaving the final decision with the host.
4. Show the offered arrangement clearly on the private Booker offer page and in
   offer communications.
5. Recheck resource availability transactionally when an offer is published and
   accepted.
6. On acceptance, reserve every allocated resource for the stay and prevent
   incompatible Cottage or Olrig Bank bookings.
7. Surface competing unaccepted offers to administrators according to the
   agreed warning-or-hold policy.
8. Preserve allocation history through replacement offers and cancellation.

## Acceptance criteria

- The request and offered arrangement remain separate and auditable.
- The Booker can see exactly which accommodation has been offered.
- Accepting an offer cannot double-book an allocated resource.
- A Cottage-dependent allocation prevents an incompatible independent Cottage
  booking.
- Replacement, expiry and cancellation have explicit resource behaviour.
- Concurrent acceptance attempts are safe at the database boundary.

## Out of scope

- Automatically generating bespoke offers.
- Removing host discretion.
- Automatically confirming standard bookings.
