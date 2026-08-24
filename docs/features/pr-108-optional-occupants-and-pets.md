# Proposed PR #108 — Optional Occupants and Pet Details

## Status

- Parent branch: `agent/managing-occupancy-epic`
- Feature branch: `agent/pr-108-optional-occupants-and-pets`
- Intended merge target: `agent/managing-occupancy-epic`
- Database changes: yes
- Public interface changes: booking request and private booking workspace
- Implementation status: candidate complete on the feature branch

## Objective

Allow the Booker to identify optional occupants and accurately describe pets
without turning those records into credentials or making the initial enquiry
unnecessarily burdensome.

## Implementation

1. Add optional occupant records containing a preferred name and adult, child
   or infant category.
2. Keep the Booker name required and every other occupant name optional.
3. Ensure named and unnamed occupants reconcile with authoritative category
   counts.
4. Add individual pet records supporting dog, cat or described other species,
   optional breed and size details, and separate service-animal identification.
5. Require count and species when pets are included; require additional detail
   only when the published policy calls for it.
6. Let the Booker maintain these records through the private booking workspace.
7. Show the same information to authorised administrators with meaningful audit
   events.
8. Do not create booking, Planner or messaging access for an occupant.

## Acceptance criteria

- The initial request succeeds with counts and Booker details alone when there
  are no pets.
- Unnamed people remain valid occupants.
- Mixed pet groups can be represented.
- Service-animal identification is not hidden in an `other` description.
- Count/category mismatches are rejected or resolved explicitly.
- No occupant email address, telephone number or date of birth is required.

## Out of scope

- Inviting occupants into the Holiday Planner.
- Identity verification.
- Bespoke accommodation allocation.

## Implemented candidate

- Migration `049_optional_occupants_and_pets.sql` adds booking-owned optional
  occupant and structured pet records without access or contact fields.
- The public request asks for one species record per declared pet, keeps breed
  and size optional, and identifies service animals independently.
- Named occupants are optional and cannot exceed the authoritative adult,
  child and infant counts. The required Booker occupies one adult place.
- Booker and administrator reservation workspaces share the same maintenance
  form and transactional validation.
- Updates replace the descriptive snapshot atomically and add booking activity;
  administrator updates also enter the administrator audit log.
- Service-animal totals participate in the immutable request-time occupancy
  assessment.

## Verification

- `npm run check`
- `npm run build`
- `npm run test:booking-lifecycle` — 57 passing
- `npm run test:booking-integration` against local Docker PostgreSQL — 16 passing
- `git diff --check`
