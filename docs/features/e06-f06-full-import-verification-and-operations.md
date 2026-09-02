# E06-F06 — Full Import Verification and Operations

## Status

Proposed; depends on E06-F01 through E06-F05.

## Parent epic

[`E06 — Storing Exported Airbnb Data`](epics/e06-f00-storing-exported-airbnb-data.md)

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
