# Proposed PR #107 — Booking Lifecycle and Pricing Compatibility

## Status

- Parent branch: `agent/managing-occupancy-epic`
- Feature branch: `agent/pr-107-occupancy-booking-compatibility`
- Intended merge target: `agent/managing-occupancy-epic`
- Database changes: possible compatibility cleanup
- Public interface changes: booking summaries and communications

## Objective

Make party composition and its assessment consistent throughout pricing,
offers, administration, customer pages, messages and notifications.

## Implementation

1. Define the occupancy values supplied to pricing and remove ambiguous uses of
   the legacy guest total.
2. Show adults, children, infants and pets consistently in administrator and
   private Booker summaries.
3. Include the assessment outcome and reasons in administrator review without
   exposing internal rule structure to the Booker.
4. Update quotation, offer, lifecycle, message and notification emails.
5. Ensure a tailored offer never alters the original requested composition.
6. Preserve the policy and assessment snapshot through offer, approval,
   cancellation, deletion queue and activity history transitions.
7. Remove transitional compatibility storage only when all consumers have been
   migrated safely.

## Acceptance criteria

- Every booking surface reports the same party composition.
- Pricing receives documented, tested occupancy inputs.
- Existing review-and-offer behaviour is unchanged.
- Assessment reasons are useful to administrators and safe for Bookers.
- No lifecycle transition silently recalculates the submitted assessment.

## Out of scope

- Direct confirmation or payment of standard bookings.
- Named occupant and pet-detail editing.
- Bespoke room allocation.
