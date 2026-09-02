# E06-F03 — Reservation and Conversation Import

## Status

Proposed; depends on E06-F01.

## Parent epic

[`E06 — Storing Exported Airbnb Data`](epics/e06-f00-storing-exported-airbnb-data.md)

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
