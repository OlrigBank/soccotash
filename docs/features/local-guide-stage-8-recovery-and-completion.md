# Proposed feature — Stage 8: Recovery and migration completion

## Status

- Epic: [Local Guide Database Migration](./epics/local-guide-database-migration-epic.md)
- Base and merge target: `agent/local-guide-db-migration-epic`
- Feature branch: `agent/local-guide-stage-8-recovery`
- Completion: test, merge locally into the epic branch, recheck, then delete this feature branch
- Depends on: [Stage 7](./local-guide-stage-7-contribution-integration.md)
- Enables: epic completion
- Implementation: complete and accepted on the feature branch

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

## Implementation and acceptance record

- Added deterministic versioned JSON export and empty-database restore commands for entries, revisions, aliases, lifecycle events and contribution provenance.
- Restore recreates administrator attribution as disabled recovery identities and deliberately excludes password hashes and other credentials.
- Added an integration test that exports a populated source database, restores an empty target database, reconciles the complete export and rejects restoration into a non-empty target.
- Removed the temporary planner slug dual-write column and migration fingerprint column after stable-ID and migration reconciliation tests passed.
- Documented backup, restore, rollback, failure-response and retention procedures in [Local Guide recovery](../../local-guide-recovery.md).
- The complete booking lifecycle suite, Astro checks, production build and PostgreSQL integration suite passed.
- A fresh Docker deployment applied migration 038 successfully. Live acceptance confirmed that all 39 migrated entry URLs and the published all-places example plan return successfully, with neither compatibility column remaining.
