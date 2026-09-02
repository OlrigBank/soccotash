# E06 — Storing Exported Airbnb Data

## Status

Active. E06-F01 through E06-F05 are complete.

## Epic summary

Import the private Airbnb review and booking-conversation records already
captured as verified PDFs into a normalized, private PostgreSQL model. Preserve
the source evidence and every captured field while making reviews,
reservations, messages, service events and financial breakdowns queryable.

This epic continues:

- [`Capturing Airbnb reviews`](../completed/capturing-airbnb-reviews.md); and
- [`E05 — Capturing All Details from Airbnb Messages`](e05-f00-capturing-all-details-from-airbnb-messages.md).

It begins from the PDFs beneath `output/pdf/`; it does not repeat live Airbnb
browser capture.

## Source baseline

The reviewed source collection contains:

- 52 review PDFs with 52 unique Airbnb review IDs;
- 103 booking PDFs across the combined and active-inbox collections;
- 89 unique Airbnb conversation IDs;
- 14 booking conversations represented in both booking collections;
- 52 public reviews and six ordered detailed-rating categories per review;
- 23 private guest notes;
- reservation, party, cancellation, access, conversation and financial data;
- host and Airbnb service messages in displayed order; and
- both **You earn** and **Guest paid** financial views for every qualifying
  booking capture.

The counts are an import baseline, not permanent business constants. Importers
must derive and reconcile counts from their supplied source set.

## Desired outcome

1. Store every PDF as immutable import provenance without storing the binary in
   PostgreSQL.
2. Deduplicate canonical reviews by Airbnb review ID.
3. Deduplicate canonical reservations by Airbnb conversation ID while retaining
   every source-document relationship.
4. Store reservation, party, conversation and financial data in normalized
   tables with lossless raw extraction alongside it.
5. Store public review text, private feedback, category scores and ordered
   feedback tags.
6. Associate reviews with reservations through an explicit, auditable process
   that never treats a guest name as sufficient identity.
7. Make repeated imports idempotent and reject conflicting evidence.
8. Verify imported counts, identities, monetary reconciliation and source-file
   hashes against the complete PDF set.
9. Keep all imported Airbnb data private and unavailable to public application
   routes.

## Architectural boundary

Imported Airbnb history must not be inserted into `provisional_bookings`,
`booking_messages`, `booking_offers`, `booking_activity` or payment tables.
Those tables drive the live direct-booking lifecycle and have different
identity, notification, access-token and deletion semantics.

The E06 tables form a separate `airbnb_*` domain. A later explicitly authorised
feature may consume selected imported facts, but this epic adds no public or
Booker-facing access and sends no notification.

## Proposed data model

### Import provenance

#### `airbnb_import_batches`

One row per attempted import, containing source collection, source snapshot
date, importer schema version, status, expected/imported counts, timestamps and
non-sensitive diagnostics.

#### `airbnb_source_documents`

One immutable row per PDF containing its batch, document type, private relative
path, SHA-256 hash, Airbnb source ID, page count, capture time and lossless
parsed source payload. Binary PDF content remains on protected local storage.

### Booking records

#### `airbnb_reservations`

One canonical row per Airbnb conversation ID containing source listing,
optional mapped local property, guest/group display information, arrival,
departure, number of nights, check-in/out times, party counts, booking date,
status, cancellation policy, confirmation code, currency, headline host total
and source timestamps.

#### `airbnb_reservation_private_details`

Restricted one-to-one data that needs stricter handling, including host notes,
profile text and encrypted access-code material. Access codes must never appear
in ordinary queries, logs or fixtures and require an explicit retention rule.

#### `airbnb_reservation_documents`

A many-to-many provenance link between canonical reservations and their source
documents. It records which capture is preferred without discarding duplicate
or later evidence.

#### `airbnb_conversation_entries`

Ordered guest, host and Airbnb service entries. Preserve entry type, sender
type/name, body, displayed date/time, nullable resolved timestamp, timestamp
precision and the raw entry payload. A displayed date without a year must not
be silently converted into a precise timestamp.

#### `airbnb_conversation_reactions`

Ordered reactions attached to a conversation entry, including the reaction and
optional displayed reactor identity.

### Financial records

#### `airbnb_financial_summaries`

One record per reservation and perspective (`host_earnings` or `guest_paid`),
with currency, total in integer minor units, capture time and raw displayed
panel text.

#### `airbnb_financial_line_items`

Ordered, optionally nested rows for nightly charges, adjustments, service fees
and future Airbnb charge types. Store description, optional service date,
quantity, unit amount, signed line amount and raw displayed text.

### Review records

#### `airbnb_reviews`

One canonical row per Airbnb review ID containing reviewer display name,
listing, stay dates, published date, overall rating, public text, optional
private feedback, source-document reference and capture date.

#### `airbnb_review_category_ratings`

One ordered rating per review/category. Initial category keys are `check-in`,
`cleanliness`, `accuracy`, `communication`, `location` and `value`; categories
remain rows so later Airbnb categories do not require columns.

#### `airbnb_review_feedback_tags`

Ordered, deduplicated feedback tags for each detailed category rating.

### Cross-source reconciliation

#### `airbnb_review_reservation_links`

Candidate and confirmed associations between reviews and reservations. Record
status, match method, confidence, non-sensitive evidence and manual-review
audit. Guest name alone is never an acceptable confirmed match.

## Core database rules

- Use internal `BIGSERIAL` keys and unique UUID public identifiers where an
  administrative interface may later expose records.
- Store external identifiers as `TEXT`; do not assume they fit JavaScript-safe
  integers.
- Store money as signed `BIGINT` minor units plus an uppercase ISO currency.
- Require departure after arrival and reconcile the captured night count.
- Require unique `(reservation_id, position)` conversation ordering.
- Require one financial summary per reservation/perspective.
- Require ratings from 1 through 5 and one category key per review.
- Use source IDs and document hashes for idempotency.
- Abort on a conflicting re-import instead of overwriting accepted evidence.
- Retain raw extraction JSON for losslessness, but query normalized columns for
  application behavior and verification.

## Feature sequence

### E06-F01 — Private import schema and provenance

[Feature record](../completed/e06-f01-private-import-schema-and-provenance.md)

Delivered the migration, constraints, indexes and private-table boundary for
import batches, source documents, reservations, messages, finances, reviews and
review/reservation links.

### E06-F02 — Review PDF import

[Feature record](../completed/e06-f02-review-pdf-import.md)

Delivered an idempotent transactional import of the 52 review PDFs, detailed
ratings, private feedback and ordered feedback tags.

### E06-F03 — Reservation and conversation import

[Feature record](../completed/e06-f03-reservation-and-conversation-import.md)

Delivered canonical reservation, private-detail and ordered-conversation
imports while retaining and reconciling both source collections.

### E06-F04 — Financial breakdown import and reconciliation

[Feature record](../completed/e06-f04-financial-breakdown-import.md)

Delivered both financial perspectives as signed minor-unit totals and ordered
line items, retaining raw text and reconciling displayed arithmetic.

### E06-F05 — Review-to-reservation reconciliation

[Feature record](../completed/e06-f05-review-reservation-reconciliation.md)

Delivered auditable candidate links from exact listing/stay evidence, strict
automatic confirmation and an immutable, audited manual-review path.

### E06-F06 — Full import verification and operations

[Feature record](../e06-f06-full-import-verification-and-operations.md)

Run the complete import against the isolated Agent 2 database, verify counts
and relationships, prove idempotency and document backup, restore and recovery.

## Privacy and security requirements

- Treat all imported tables as private administrative data.
- Add no public API, page, serialization or analytics exposure.
- Never include guest messages, private feedback, confirmation codes, profile
  details, access instructions or financial values in normal logs.
- Use synthetic fixtures in Git; source-derived fixtures remain ignored.
- Keep PDFs, extracted text, raw manifests and reconciliation reports ignored.
- Encrypt access-code material outside SQL literals and document its deletion
  or expiry policy before importing it.
- Do not send email, WhatsApp or any other notification during import.
- Do not modify Airbnb or contact a guest.

## Acceptance criteria

1. A fresh database receives the complete E06 schema through the normal ordered
   migration runner.
2. The 52 review PDFs produce 52 unique review records.
3. The 103 booking PDFs produce 89 unique reservation records while preserving
   all 103 source-document associations.
4. All captured conversation entries retain stable displayed order.
5. Every imported reservation has both financial perspectives and reconciled
   or explicitly flagged totals.
6. Every review has six ordered category ratings; all available private notes
   and feedback tags are retained privately.
7. Review/reservation links record evidence and never rely on name alone.
8. Re-running an unchanged import creates no duplicate canonical or child rows.
9. Changed evidence with the same source identity fails safely and produces a
   non-sensitive conflict report.
10. Integration tests use the isolated Agent 2 PostgreSQL database and leave no
    persistent test data.
11. Private source material remains ignored by Git.
12. Backup and restore preserve all imported records and their provenance.

## Out of scope

- Re-capturing Airbnb through the browser.
- Importing PDF binaries into PostgreSQL.
- Publishing private reviews, messages or financial data.
- Merging Airbnb records into the live direct-booking lifecycle.
- Automatically contacting guests or changing reservations.
- Building a public or guest-facing Airbnb history interface.
