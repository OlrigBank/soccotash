# Proposed PR — Stage 1.5: Example-plan duplication and revision history

## Status

- Epic: [Olrig Bank Planner](./epics/olrig-bank-planner-epic.md)
- Target branch: `development`
- Suggested feature branch: `feature/planner-duplication-revisions`
- Depends on: Stage 1.4

## Objective

Make example plans safely reusable and make their change history visible and
useful to administrators before guest plans depend on the same mechanisms.

## Scope

- Duplicate an example plan, its days, custom items and Local Guide references
  in one transaction.
- Assign new plan/day/item identifiers while preserving order and semantic
  content.
- Ensure the copy is a fully independent draft with its own revision sequence,
  publication state and timestamps.
- Add an Admin revision-history view showing actor, source, timestamp and a
  meaningful summary of changes.
- Store structured before/after change data where appropriate while avoiding
  sensitive or needlessly duplicated content.
- Define the initial history retention and archive visibility policy.
- Add explicit conflict feedback based on the revision mechanism introduced in
  Stage 1.1.

## Acceptance criteria

- An administrator can duplicate a complete example plan.
- The original and copy have different identifiers and can be edited
  independently.
- The copy starts unpublished and cannot inherit a public URL accidentally.
- Day/item ordering and Local Guide references survive duplication.
- History identifies the administrator and summarizes meaningful changes.
- Reorder, status, archive and duplication actions are auditable.
- Failed duplication leaves no partial plan, day, item or history records.
- Stale writes are rejected and visible to the administrator.

## Tests

- Deep-copy independence and identifier tests.
- Transaction rollback tests for partial duplication failure.
- Revision summary, actor/source and ordering-history tests.
- Concurrent/stale mutation tests.
- Authorization tests, existing suites, Astro checks and production build.

## Out of scope

- Restoring arbitrary historical revisions unless separately approved.
- Guest-plan copying; Stage 2 will reuse the proven copy service with a
  different destination type and authorization policy.
- Public and printable presentation.
