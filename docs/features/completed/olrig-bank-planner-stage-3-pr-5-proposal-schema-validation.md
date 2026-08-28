# Proposed PR — Stage 3.5: Proposed-change schema and validation

## Objective

Allow an external AI capability to submit a bounded, strictly validated itinerary proposal without changing the authoritative Holiday Plan.

## Scope

- Define the closed `olrig-holiday-plan-proposal` version `1.0` JSON Schema.
- Permit only add, update, move and remove item proposals.
- Exclude booked status, reservation notes, visibility, booking, participant, payment and Local Guide consent fields.
- Limit submissions to 64 KiB and 100 operations.
- Require the capability plan ID and source revision.
- Store valid submissions as pending, retaining source and received revisions and stale status.
- Return structured validation errors and never partially persist invalid payloads.

## Out of scope

- Diff presentation and individual review.
- Applying, partially applying or rejecting proposals.
- Rate limiting and final audit hardening.
