# Primary local September Airbnb import — 29 September 2026

The owner explicitly selected the primary local database for this import,
overriding the isolated-Agent-2-only scope of the older private import runbook.
No Render database or deployed service was changed.

## Destination and diagnosis

- Running site: `olrigbank-site-1`, HTTP port 8080.
- Database container: `soccotash-database-1`; host connection
  `127.0.0.1:5433`, database `soccotash`, schema `public`.
- Read-only queries using the running website's own connection confirmed that
  all 14 Airbnb tables already existed, but reviews, reservations and source
  documents were empty. Public homepage reviews come from bundled
  `site/src/data/public-reviews.json` and `public-review-summary.json`, separately
  from the private database import.

## Preparation

- Revalidated five review PDFs and four booking PDFs against captured JSON and
  manifest hashes. Two bookings explicitly omit unvalidated conversations.
- Created an owner-readable custom-format backup and checked its archive table
  of contents: `backups/before-airbnb-september-2026-09-29T14-05-05-631Z.dump`.
- Verified existing Airbnb migration checksums, then applied only
  `066_airbnb_optional_review_publication.sql` transactionally with its checksum
  and migration advisory lock. Unrelated migration 065 remains unapplied.
- The primary import encryption key is retained in the ignored, owner-readable
  `.airbnb-capture/primary-import-key` file. Its value was not printed.

## Import and verification

The current repository review and booking import scripts processed only the
`output/pdf/airbnb-terminal/september-2026/` directories. Reconciliation followed
both imports. Repeating all three commands added no records or links.

| Record | Result |
| --- | ---: |
| Source documents | 9 |
| Reviews | 5 |
| Category ratings | 30 |
| Reservations | 4 |
| Financial summaries | 8 |
| Conversation entries | 11 |
| Confirmed review links | 4 |
| Unlinked reviews | 1 |
| Bookings flagged with incomplete messages | 2 |

All nine stored source hashes match the validated PDFs. Both incomplete-message
markers are retained in source evidence. The old fixed 155-document verifier
was not used to certify this nine-document dataset.

## Remaining application step

The running Docker image predates the incomplete-message warning. Database
counts are available now, but the local application needs a reviewed rebuild
before it can display the new notice. No rebuild or restart was performed as
part of this import. The historical full dataset was not imported.
