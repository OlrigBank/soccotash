# E06-F03 — Reservation and Conversation Import

## Status

Complete.

## Parent epic

[`E06 — Storing Exported Airbnb Data`](../epics/e06-f00-storing-exported-airbnb-data.md)

## Objective

Import booking PDFs into canonical Airbnb reservations and ordered conversation
records while preserving every capture and safely handling incomplete displayed
dates.

## Scope

- Parse reservation identity, listing, stay dates/times, party composition,
  booking date, status, cancellation policy and headline total.
- Store host notes, guest profile text and access-code material under the
  stricter private-details boundary.
- Parse guest/host messages and Airbnb service events in displayed order.
- Preserve message body, sender, raw displayed date/time, reactions and raw
  source payload.
- Resolve a full timestamp only when evidence is sufficient; record yearless
  timestamps without inventing a year.
- Deduplicate canonical records by conversation ID.
- Preserve all PDF-to-reservation links, including the 14 cross-collection
  duplicate captures.

## Reconciliation rules

- Source listing names map through an explicit configuration to local
  `property_id` values; unknown listings stop the import.
- Captured night count must agree with arrival/departure when both dates contain
  years.
- Duplicate captures must agree on stable reservation fields or enter conflict
  review.
- Guest/group labels are descriptive and never canonical identity.

## Tests

- Individual and group reservations, adults and pets.
- Booking records with and without confirmation code/booking date.
- Suggested door-code handling without plaintext logs or fixtures.
- Guest, host and Airbnb service entries, reactions and Unicode names.
- Yearless displayed dates and duplicate collection provenance.
- Conflicting stable fields roll back atomically.

## Acceptance criteria

1. The 103 booking PDFs produce 89 canonical reservations and 103 document
   associations.
2. Each conversation entry retains its displayed order and source wording.
3. All observed reservation variants are represented without lossy fallback.
4. Access-code values never appear in logs, committed fixtures or ordinary
   reservation queries.
5. Re-running the importer is idempotent.

## Delivered implementation

- Added a private booking-PDF parser and transactional command-line importer.
- Canonical reservations are keyed by Airbnb conversation ID, while every PDF
  remains linked as provenance; conflicting duplicate captures abort the batch.
- Conversation messages and Airbnb service events retain source order, wording
  and displayed timestamps. Dates without enough evidence are explicitly
  recorded as `year_unknown` or `unresolved` rather than inferred.
- Suggested access codes are AES-256-GCM encrypted before database insertion.
  Plaintext codes are excluded from raw extraction, diagnostics and tests.
- The source PDFs do not reliably expose reaction attribution as structured
  data, so reaction rows are not invented; any displayed content remains in the
  lossless message body and source extraction.

## Validation

- Imported 103 booking PDFs into 89 canonical reservations and 103 provenance
  links, correctly reconciling 14 duplicate captures.
- Imported 1,084 ordered conversation entries, including 466 year-unknown and
  nine unresolved displayed timestamps.
- Stored 45 confirmation codes and encrypted nine suggested access codes.
- Derived five cancelled and 55 confirmed reservations from explicit
  conversation evidence; 29 remain unset where the source gives no status.
- An unchanged rerun added no documents or reservations and matched all 103
  captures.
- Focused PostgreSQL integration tests and the Astro type-check pass.
