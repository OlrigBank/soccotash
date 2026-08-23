# Proposed PR #103 — Epic Regression Alignment

## Status

- Parent branch: `agent/getting-olrig-bank-to-go-viral-epic`
- Feature branch: `agent/pr-103-epic-regression-alignment`
- Intended merge target: `agent/getting-olrig-bank-to-go-viral-epic`
- Database changes: none
- Production behaviour changes: none

## Objective

Restore a trustworthy whole-epic browser regression gate after the booking
workspace navigation was made more focused, without weakening fixture isolation
or modifying an existing local pricing configuration.

## Implementation

1. Update planner journeys to open the Holiday Planner workspace from the
   booking landing page before using its controls.
2. Assert the current Planning dashboard heading before creating a plan.
3. Run the planner regression against local Docker and retain its existing
   fixture cleanup.
4. Run the booking browser regression for pull requests to `development`, using
   its existing disposable PostgreSQL service, migrations and administrator.
   Its payment-term fixture must use `main-house`, matching the Olrig Bank
   arrangement assigned by the journey before the offer is published.
5. Keep the booking regression's loopback and explicit mutation safety gates.

## Acceptance criteria

1. All three planner regression journeys pass against local Docker.
2. The booking browser regression is automatically scheduled on the epic pull
   request to `development` and passes against an isolated database.
3. Lifecycle, database integration, Astro check and production build remain
   green.
4. No production code, persistent local pricing plan or guest data is changed.

## Out of scope

- Changing planner or booking behaviour.
- Mutating the ordinary local database's published pricing configuration.
- Publishing regression traces containing disposable private links.
