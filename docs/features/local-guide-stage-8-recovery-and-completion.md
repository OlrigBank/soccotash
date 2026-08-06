# Proposed feature — Stage 8: Recovery and migration completion

## Status

- Epic: [Local Guide Database Migration](./epics/local-guide-database-migration-epic.md)
- Depends on: [Stage 7](./local-guide-stage-7-contribution-integration.md)
- Enables: epic completion

## Objective

Prove that Local Guide content can be exported and restored without the retired runtime Markdown source, then remove temporary migration compatibility.

## Scope

- Add a complete database-to-JSON or database-to-Markdown export command.
- Include canonical slugs, aliases, lifecycle state, revisions, publication metadata and contribution provenance where appropriate.
- Restore an export into an empty database and reconcile it with the source and live manifests.
- Document database backup, restore, application rollback and failure-response procedures.
- Remove the temporary planner slug dual-write or compatibility column only after stable-ID verification.
- Decide retention for revisions, aliases, archived entries, contribution candidates and reconciliation reports.
- Complete production smoke and controlled interactive acceptance testing.

## Acceptance criteria

- A complete export recreates every current entry, revision, alias and publication state.
- Restore into an empty database passes reconciliation and runtime acceptance tests.
- Recovery does not depend on Local Guide content-collection reads.
- Existing URLs and planner references remain valid after restore.
- Temporary migration compatibility is removed where safe.
- The epic completion criteria are documented as accepted.

## Tests

- Export completeness and deterministic output tests.
- Empty-database restore and reconciliation test.
- Public, admin, contribution, planner and booking regression suites.
- Documented production smoke and interactive acceptance run.

## Out of scope

- General media management or database-managed categories.
- Moving other website content collections into PostgreSQL.
