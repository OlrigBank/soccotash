# E06-F06 — Full Import Verification and Operations

## Status

Complete.

## Parent epic

[`E06 — Storing Exported Airbnb Data`](../epics/e06-f00-storing-exported-airbnb-data.md)

## Objective

Run and verify the complete private import in the isolated Agent 2 PostgreSQL
database, prove recovery and idempotency, and document the repeatable operating
procedure.

## Scope

- Add a dry-run inventory/reconciliation mode before database writes.
- Import the complete review and booking PDF collections in bounded,
  transactional batches.
- Record import checkpoints without storing private values in logs.
- Verify document hashes, external IDs, source/canonical counts and child-row
  completeness.
- Verify financial perspectives and review category coverage.
- Run review/reservation reconciliation and report confirmed/pending/conflict
  counts.
- Repeat the complete import to prove idempotency.
- Prove backup and restore into a clean isolated database.
- Document restart, conflict investigation and safe cleanup.

## Required verification baseline

- 155 PDF source documents in total.
- 52 unique reviews.
- 103 booking source documents.
- 89 unique booking conversation IDs.
- 103 reservation/document associations.
- Two financial summaries per imported qualifying reservation.
- Six detailed category ratings per review.

If the supplied source collection changes, dry-run output must identify the new
baseline explicitly rather than weakening these checks silently.

## Tests and checks

- Unit tests for every parser and normalization boundary.
- PostgreSQL integration tests in isolated schemas/transactions.
- Fresh and existing-schema migration equivalence.
- Full private-source import and unchanged rerun.
- Controlled conflicting-source failure and restart.
- Backup/restore count and hash comparison.
- `git diff --check` and verification that every private artifact is ignored.

## Acceptance criteria

1. Dry-run reconciliation matches the reviewed baseline before writes begin.
2. The first import completes with no missing or duplicate canonical records.
3. The second unchanged import produces zero additional domain rows.
4. All required child records and financial/review invariants pass.
5. A failed batch resumes safely without duplicating earlier committed work.
6. Restored data matches source hashes and canonical/child counts.
7. Documentation enables another Codex session to repeat the workflow without
   accessing production or the primary local database.
8. No source PDF, extracted private content or generated reconciliation payload
   is committed.

## Delivered implementation

- Added a source-only dry run that parses all private PDFs, inventories external
  identities and validates the reviewed baseline before database access.
- Added full database verification of hashes, canonical/provenance counts,
  category coverage, conversation presence, financial perspectives and
  reconciliation results.
- Documented the isolated import sequence, idempotent rerun, conflict handling,
  restart, backup/restore drill, retention and safe cleanup in
  [`Private Airbnb import operations`](../../airbnb-private-import-operations.md).
- Kept verification output aggregate-only and all private source artifacts
  ignored.

## Validation

- Dry run found 155 unique PDF hashes: 52 reviews and 103 booking captures
  representing 89 conversations and 312 category ratings.
- Database verification matched every source hash and confirmed 52 reviews, 89
  reservations, 103 reservation/document links, 1,084 conversation entries,
  178 financial summaries, 52 confirmed links and six proposed alternatives.
- Complete unchanged reruns added no domain records.
- A PostgreSQL custom-format backup restored into a separately named temporary
  Agent 2 database with matching canonical counts and sorted-hash fingerprint;
  the temporary database and dump were removed after the drill.
- The complete PostgreSQL integration suite and private review tests pass.
