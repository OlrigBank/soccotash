# E07-F03 — Reservation Detail, Conversation and Finances

## Status

Complete.

## Parent epic

[`E07 — Airbnb Administration Dashboard`](../epics/e07-f00-airbnb-admin-dashboard.md)

## Objective

Display the complete useful context for one imported Airbnb reservation in a
structured admin view without exposing encrypted access material.

## Scope

- Add `/admin/airbnb/reservations/[id]/` using reservation `public_id`.
- Show stay, source status, party composition, booking date, cancellation
  policy, confirmation code and mapped property.
- Show host notes and guest-profile text in a clearly marked private section.
- Do not select or display access-code ciphertext, key version or decrypted
  values; show at most a non-sensitive “access code retained” indicator.
- Display guest, host and Airbnb service entries in source order with sender,
  body, displayed timestamp and explicit precision labels for unresolved dates.
- Display host-earnings and guest-paid summaries separately with ordered,
  nested line items and reconciliation status.
- Show linked review status and safe provenance metadata: capture date,
  collection-relative filename, source type and abbreviated hash.
- Preserve a return link to the originating filtered reservation list.

## Tests

- Full and sparse reservation variants.
- Exact, year-unknown and unresolved conversation timestamps.
- Message text is escaped and Unicode/newlines remain readable.
- Both financial perspectives, negative values and nested dated rows.
- Missing linked review and proposed/confirmed link states.
- Unknown UUID returns `404` without disclosing internal IDs.
- Response and serialized page contain no access-code ciphertext.

## Acceptance criteria

1. All normalized reservation information is understandable on one admin page.
2. Conversation ordering and original displayed timestamp meaning are retained.
3. Financial values round-trip to formatted GBP while retaining negative signs
   and hierarchy.
4. Private sections are visibly labelled and never appear outside authenticated
   administration.
5. Access-code material is not retrievable through this screen or its service.

## Delivered implementation

- Added a strict UUID detail query and `/admin/airbnb/reservations/[id]/` page,
  returning a content-free `404` for invalid or unknown identifiers.
- Displayed booking/stay facts, party composition, source status, cancellation
  policy and confirmation code with mapped property names.
- Added a visibly private host-notes and guest-profile section. The service
  selects only a boolean access-code-presence expression and never retrieves
  ciphertext, key metadata or decrypted material.
- Added ordered guest, host and Airbnb service entries with preserved whitespace,
  displayed timestamps and explicit exact/year-unknown/unresolved labels.
- Added separate host-earnings and guest-paid panels with formatted GBP totals,
  signed line items and parent/child hierarchy.
- Added linked-review navigation and safe multi-capture provenance with private
  relative paths, capture times, preferred status and abbreviated hashes.
- Preserved the originating reservation filter/pagination URL through a bounded
  admin-only return target.

## Validation

- Integration coverage verifies full and sparse fields, three timestamp
  precision cases, escaped markup-like message text, financial hierarchy,
  negative values, linked review UUIDs, provenance and unknown UUID behavior.
- Serialized service checks exclude ciphertext and raw financial panel text.
- A representative live Agent2 record returned both verified financial
  perspectives, ordered conversation entries and safe provenance.
- Route contract tests and Astro type checking pass.
