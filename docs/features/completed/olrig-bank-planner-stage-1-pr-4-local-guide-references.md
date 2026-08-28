# Proposed PR — Stage 1.4: Local Guide references in plan items

## Status

- Epic: [Olrig Bank Planner](./epics/olrig-bank-planner-epic.md)
- Target branch: `development`
- Suggested feature branch: `feature/planner-local-guide-references`
- Depends on: Stage 1.3

## Objective

Reuse the existing Local Guide inside example plans while keeping guide content
authoritative and plan-specific details separate.

## Scope

- Add an administrator browse/search selector over the existing Astro Local
  Guide content collection.
- Create a plan item from a selected guide entry using its stable identifier.
- Render current guide title, summary, location, links and public details from
  the content collection rather than copying them into planner data.
- Retain timing, lifecycle status, reservation details and itinerary notes on
  the plan item.
- Allow a guide reference to be replaced or detached without modifying or
  deleting the guide entry.
- Define safe behaviour for a missing, renamed or unpublished guide entry:
  Admin receives a visible warning and the planner remains editable.
- Mark custom items as potential future guide candidates for administrator
  awareness only; do not create a contribution or publication workflow.

## Acceptance criteria

- An administrator can find and add a Local Guide entry to a plan day.
- Guide-backed and custom items coexist and remain visually distinguishable.
- Editing plan-specific notes does not alter the Local Guide source file.
- Current guide content is rendered without storing a second descriptive copy.
- Missing or invalid references do not crash the planner or expose draft data.
- Detaching a guide reference preserves explicitly entered plan-specific data.
- Existing Local Guide routes and content rendering remain unchanged.

## Tests

- Guide lookup and reference-validation tests.
- Rendering tests for guide-backed, custom and missing-reference items.
- Tests proving planner edits cannot mutate Local Guide source content.
- Admin authorization, revision and stale-write tests.
- Existing suites, Astro checks and production build.

## Out of scope

- Creating or editing Local Guide entries from the planner.
- Guest contribution consent and moderation.
- Duplication and publication.
