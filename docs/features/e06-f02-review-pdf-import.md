# E06-F02 — Review PDF Import

## Status

Proposed; depends on E06-F01.

## Parent epic

[`E06 — Storing Exported Airbnb Data`](epics/e06-f00-storing-exported-airbnb-data.md)

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
