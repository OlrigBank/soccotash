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

## E15 decision

[E15 — Publish offers for priced standard stays](../epics/completed/e15-f00-publish-offers-for-priced-standard-stays.md)
implements an immediate published offer for priced standard Olrig Bank and Cottage
requests. Acceptance, payment and confirmation remain separate. Promo codes,
Olrig Bank++, bespoke and host-decision requests retain review. See E15 for the
agreed conditions, implementation and verification evidence.
