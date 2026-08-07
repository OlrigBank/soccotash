# Proposed PR — Stage 1.3: Admin plan-item editor and ordering

## Status

- Epic: [Olrig Bank Planner](./epics/olrig-bank-planner-epic.md)
- Target branch: `development`
- Suggested feature branch: `feature/admin-planner-items`
- Depends on: Stage 1.2

## Objective

Allow administrators to turn a day structure into a complete itinerary using
custom activities, journeys, meals, reservations and free-time blocks.

## Scope

- Add, edit and remove custom plan items within a day.
- Support title, plan-specific description/notes, item type, start/end time,
  location text, reservation note, visibility and lifecycle status.
- Reorder items within a day and move an item between days.
- Enforce valid time ranges, item lifecycle transitions and item visibility on
  the server.
- Provide accessible non-drag reordering and moving controls.
- Include revision checks and meaningful item-level history summaries.
- Show explicit confirmation where removing an item would discard content.

## Acceptance criteria

- An administrator can create a complete multi-day plan using custom items.
- Items can be edited, removed, reordered and moved between days.
- Time validation and allowed status transitions are consistently enforced.
- The UI distinguishes item status using text, not colour alone.
- Reordering preserves stable item identifiers.
- Stale edits produce a conflict response rather than overwriting newer work.
- Item mutations create actor-attributed plan revisions atomically.
- The interface is usable with keyboard controls and at narrow viewport widths.

## Tests

- Item validation and lifecycle-transition unit tests.
- PostgreSQL mutation, move, ordering, rollback and concurrency tests.
- Route authorization and same-origin tests.
- Responsive and keyboard interactive acceptance.
- Existing tests, Astro checks and production build.

## Out of scope

- Local Guide-backed items.
- Duplication, publication and public presentation.
- Guest participation, contributions and AI access.
