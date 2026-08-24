# Future Feature — Direct Standard Booking

## Context

The Managing Occupancy epic classifies each request as `standard`, `bespoke` or
`host_decision_required`, but deliberately retains administrator review and an
offer for every submission.

## Future objective

Allow a request assessed as standard to follow a more direct booking route
without weakening availability, pricing, payment, contact or occupancy safety.

## Preconditions

- Published occupancy and pricing policies exist for the selected arrangement.
- Availability is rechecked transactionally before any commitment.
- The assessment and pricing snapshots are retained with the booking.
- Bespoke and host-decision outcomes continue through conversation and a
  tailored administrator offer.
- Pet and service-animal rules are operationally agreed, not merely modelled.
- A clear payment/confirmation transition is chosen; submission alone must not
  silently imply confirmation.

## Work to define

- Whether “direct” means an immediate offer, immediate payment request, or
  confirmation after payment verification.
- Which standard arrangements and channels are eligible.
- How failures or policy changes between quote and submission are presented.
- Whether any risk flags still force administrator review.
- Notifications, cancellation wording, monitoring and rollback controls.

This is intentionally separate from the completed occupancy epic.
