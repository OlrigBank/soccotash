# E06-F02 — Review PDF Import

## Status

Complete.

## Parent epic

[`E06 — Storing Exported Airbnb Data`](../epics/e06-f00-storing-exported-airbnb-data.md)

## Objective

Import the existing Airbnb review PDFs into canonical review, category-rating
and feedback-tag records with immutable source provenance.

## Scope

- Reuse the proven review PDF parser rather than create a competing grammar.
- Adapt parsed private-manifest records into database import commands.
- Import Airbnb review ID, reviewer display name, source/local listing, stay
  dates, published date, overall rating, public text and private feedback.
- Import the six ordered detailed categories and ordered unique feedback tags.
- Record source path, hash, page count, capture date and raw parsed payload.
- Make the import transactional, resumable by batch and idempotent by review ID
  and document hash.

## Conflict handling

- An identical source hash is a no-op.
- A second document with identical canonical content may add provenance.
- A repeated review ID with different substantive content aborts and records a
  non-sensitive conflict status.
- Import output reports counts and IDs only, never review text or private notes.

## Tests

- Synthetic examples with and without private feedback.
- Ratings from 1 through 5 and feedback-tag ordering/deduplication.
- Cross-year stays and repeated reviewer names.
- Duplicate document, duplicate review ID and conflicting review cases.
- Transaction rollback after a child-row failure.

## Acceptance criteria

1. The current source set produces 52 canonical reviews and 52 source
   documents.
2. Every review has exactly six correctly ordered category ratings.
3. All 23 available private notes are retained only in private storage.
4. Re-running the import changes no canonical or child-row counts.
5. Existing public-review JSON generation remains independent and unchanged.

## Delivered implementation

- Added `src/lib/airbnb-import/reviews.ts` as the transactional persistence
  boundary for review evidence.
- Added `scripts/import-airbnb-reviews.ts` to hash PDFs, obtain page counts,
  reuse the proven private review parser and import normalized records.
- Added the `reviews:import-private` package command.
- Records a durable pending/completed/failed batch without placing review text
  or private feedback in diagnostics.
- Treats an existing document hash and matching review as unchanged.
- Accepts an additional source document only when its canonical review payload
  exactly matches stored evidence.
- Rolls back source and domain rows when a repeated review ID conflicts.
- Imports category ratings and normalized feedback tags in displayed order.

## Validation completed

- Added a PostgreSQL integration test covering normalized review, rating and
  feedback rows, private feedback, unchanged reruns, additional identical
  evidence and transactional conflict rollback.
- Imported the complete private source set into Agent 2: 52 documents, 52
  canonical reviews, 23 private notes, 312 category ratings and 463 feedback
  tags.
- Repeated the same 52-document import: zero documents and reviews were added,
  and all 52 reviews were unchanged.
- All 23 PostgreSQL integration tests and all 27 review/parser tests passed.
- `astro check` completed with zero errors and one pre-existing unused-variable
  hint in `src/pages/admin/login.astro`.
