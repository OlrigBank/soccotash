# E06-F05 — Review-to-Reservation Reconciliation

## Status

Complete.

## Parent epic

[`E06 — Storing Exported Airbnb Data`](../epics/e06-f00-storing-exported-airbnb-data.md)

## Objective

Associate imported reviews with their originating Airbnb reservations using
auditable evidence while preventing false matches between repeated or similar
guest names.

## Candidate evidence

- Exact mapped listing/property.
- Exact arrival and departure dates.
- Exact number of nights.
- Compatible normalized reviewer/booker display names as supporting evidence.
- Confirmation or source identifiers if later evidence exposes them.

Name similarity alone must never confirm a link.

## Scope

- Generate deterministic candidate links and a confidence/evidence record.
- Auto-confirm only one-to-one matches supported by exact stay and listing
  evidence plus compatible identity evidence.
- Leave ambiguous, missing and contradictory matches pending.
- Allow an administrator/import operator to confirm or reject a candidate with
  audit timestamps and reviewer identity.
- Make reconciliation repeatable without replacing manual decisions.
- Report counts and external IDs without displaying private content.

## Tests

- Unique exact match.
- Same guest name on different stays.
- Different group/booker labels for the same stay.
- Same dates across different listings.
- Multiple plausible reservations and no candidate.
- Manual confirmation/rejection surviving a rerun.

## Acceptance criteria

1. Every review has zero or more explainable candidate links.
2. Every confirmed link has evidence stronger than guest name alone.
3. Ambiguous matches remain pending rather than being guessed.
4. Manual decisions are immutable audit events or fully audited state changes.
5. Re-running reconciliation produces no duplicate links and preserves manual
   decisions.

## Delivered implementation

- Added deterministic candidate generation using exact property, arrival,
  departure and night-count evidence, with normalized identity compatibility
  used only as supporting evidence.
- Automatic confirmation requires exactly one identity-compatible candidate for
  both the review and reservation; stay-only alternatives remain proposed.
- Added partial unique indexes enforcing at most one confirmed link per review
  and per reservation.
- Added immutable manual candidate decisions. A manual confirmation can
  explicitly supersede an automatic confirmation, with both changes recorded
  in the existing administrator audit log; it cannot supersede another manual
  confirmation silently.
- Reconciliation uses conflict-safe inserts, preserves manual decisions and
  reports counts without private content.

## Validation

- Reconciled all 52 imported reviews against 89 reservations.
- Generated 58 explainable candidates: 52 automatically confirmed and six
  ambiguous stay-only alternatives left proposed.
- Every review has exactly one confirmed link, and no confirmation lacks exact
  stay/listing evidence plus compatible identity evidence.
- An unchanged rerun added no links.
- Focused PostgreSQL tests cover unique matches, repeated stay dates, an absent
  candidate, manual supersession, immutable decisions and audit records.
