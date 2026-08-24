# Proposed PR #108 — Optional Occupants and Pet Details

## Status

- Parent branch: `agent/managing-occupancy-epic`
- Feature branch: `agent/pr-108-optional-occupants-and-pets`
- Intended merge target: `agent/managing-occupancy-epic`
- Database changes: yes
- Public interface changes: booking request and private booking workspace

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
