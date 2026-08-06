# Proposed feature — Stage 6: Local Guide administration and publication

## Status

- Epic: [Local Guide Database Migration](./epics/local-guide-database-migration-epic.md)
- Base and merge target: `agent/local-guide-db-migration-epic`
- Feature branch: `agent/local-guide-stage-6-administration`
- Completion: test, merge locally into the epic branch, recheck, then delete this feature branch
- Depends on: [Stage 5](./local-guide-stage-5-retire-markdown-runtime.md)
- Enables: deployment-independent Local Guide maintenance

## Objective

Allow authenticated administrators to maintain the database-backed place pool safely through the Planner administration environment.

## Scope

- Add entry listing and status/category filtering.
- Add draft creation and working-revision editing.
- Add Markdown preview using the public renderer.
- Add explicit publish, republish, unpublish and archive actions.
- Add revision history, comparison and rollback as a new revision.
- Add canonical slug editing with retained aliases.
- Add recommendation, image path and external link editing.
- Require server-side authorisation, same-origin protection and expected revisions for mutations.
- Retain entered values after validation failures and provide recoverable stale-edit conflicts.
- Make archived entries read-only.

## Acceptance criteria

- An administrator can create, preview and publish a place without deployment.
- The place appears publicly and in the example-plan picker after publication.
- Editing published content remains private until republished.
- Stale edits cannot overwrite newer work.
- Unpublication immediately removes public access and new-plan selection.
- Revision history attributes every meaningful change.
- Forms and lifecycle controls meet the epic accessibility requirements.

## Tests

- Authentication, same-origin and permission tests.
- Create, edit, preview and lifecycle integration tests.
- Stale-write recovery and revision rollback tests.
- Admin browser accessibility and workflow tests.

## Out of scope

- Rich-text editing or media upload.
- Category administration.
- Guest contribution linkage.
