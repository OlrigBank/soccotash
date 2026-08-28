# Proposed PR — Stage 1.2: Admin plan and day management

## Status

- Epic: [Olrig Bank Planner](./epics/olrig-bank-planner-epic.md)
- Target branch: `development`
- Suggested feature branch: `feature/admin-planner-days`
- Depends on: Stage 1.1

## Objective

Give authenticated administrators the first usable planner workspace: create,
edit, list and archive example plans and manage their ordered day structure.

## Scope

- Add an Admin Planner entry point and list view for draft, published,
  unpublished and archived example plans.
- Create and edit plan title, description, duration or optional date range.
- Add, edit and remove plan days with title, summary and relative or dated
  placement.
- Reorder days with accessible move controls; drag-and-drop may be added only as
  a progressive enhancement.
- Require admin authentication, same-origin mutation protection, server-side
  validation and expected-revision checks on every mutation.
- Display useful stale-edit and validation feedback without losing submitted
  values.
- Write actor-attributed revision summaries for meaningful plan/day changes.

## Acceptance criteria

- An authorised administrator can create a multi-day draft example plan.
- Plans can be listed, opened, edited and archived without hard deletion.
- Days can be added, renamed, summarised, removed and reordered.
- Both relative-day plans and explicitly dated plans obey consistent date rules.
- Keyboard-operable move controls provide a complete reordering workflow.
- An unauthenticated user cannot read admin planner pages or invoke mutations.
- Forged, malformed and stale mutations are rejected server-side.
- Each successful meaningful change records the administrator and new revision.
- Existing Admin navigation and existing product workflows remain intact.

## Tests

- Plan/day service and route tests, including validation and stale revisions.
- Admin authentication and same-origin enforcement tests.
- Ordering, deletion-policy and archive tests.
- Astro checks, existing suites and production build.
- Interactive acceptance of a complete multi-day skeleton using keyboard-only
  reordering as well as the standard pointer workflow.

## Out of scope

- Plan items and Local Guide selection.
- Duplication, preview, publication and public pages.
- Guest access and collaboration.
