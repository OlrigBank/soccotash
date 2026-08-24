# Proposed PR #109 — Bespoke Accommodation Resource Model

## Status

- Parent branch: `agent/managing-occupancy-epic`
- Feature branch: `agent/pr-109-bespoke-accommodation-resources`
- Intended merge target: `agent/managing-occupancy-epic`
- Database changes: yes
- Public interface changes: none
- Implementation status: candidate complete on the feature branch

## Objective

Represent the parts of Olrig Bank and the Cottage whose use changes capacity or
availability so the host can construct flexible bespoke arrangements safely.

## Implementation

1. Define stable accommodation resources for spaces that affect capacity,
   independent availability or booking conflicts.
2. Model the standard Olrig Bank, Olrig Bank Max and Cottage arrangements as
   explicit resource bundles.
3. Permit other host-approved bundles without changing the public listing
   definitions.
4. Record sleeping capacity and practical notes without promising that capacity
   is automatically available or suitable.
5. Map existing availability properties and blocks onto the resource model.
6. Add an administrator-only resource and bundle view with validation and audit
   history.
7. Preserve existing availability behaviour until offer allocation is connected
   in the following PR.

## Acceptance criteria

- Standard arrangements resolve to deterministic underlying resources.
- Cottage-dependent arrangements can be distinguished from an independently
  available Cottage.
- A descriptive amenity is not forced into the resource model unless it affects
  capacity or conflicts.
- Existing calendar imports and booking blocks continue to behave correctly.
- Resource identities remain stable across display-name changes.

## Out of scope

- Accepting an offer or creating resource reservations.
- Automatically deciding which bundle suits a party.
- Publishing new accommodation listings.

## Implemented candidate

- Migration `050_accommodation_resources.sql` introduces stable resources,
  resource bundles, property compatibility mappings and administrator events.
- Seeded bundles deterministically represent Olrig Bank (capacity 8), Olrig
  Bank Max (capacity 12), the independent Cottage (capacity 4), and a blank
  host-approved bespoke starting point.
- Rear bedrooms and facilities retain their Cottage availability dependency;
  the independent Cottage additionally requires its independent living space.
- The compatibility mapping is deliberately not connected to booking blocks,
  availability queries or reservations in this feature.
- `/admin/accommodation/` lets authorised administrators maintain resource
  descriptions/capacities and create or update host-approved bundles. Seeded
  standard bundles and all stable keys remain read-only.
- Resource and bundle changes are validated transactionally and recorded with
  administrator identity and structured audit details.

## Verification

- `npm run check`
- `npm run build`
- `npm run test:booking-lifecycle` — 58 passing
- `npm run test:booking-integration` against local Docker PostgreSQL — 17 passing
- `git diff --check`
