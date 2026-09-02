# E06-F05 — Review-to-Reservation Reconciliation

## Status

Proposed; depends on E06-F02 and E06-F03.

## Parent epic

[`E06 — Storing Exported Airbnb Data`](epics/e06-f00-storing-exported-airbnb-data.md)

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
