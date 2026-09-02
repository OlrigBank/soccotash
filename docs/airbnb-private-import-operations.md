# Private Airbnb import operations

This procedure operates only on the isolated Agent 2 development database. It
must not be run against production or the primary local database. The private
PDFs beneath `output/pdf/` and `.env.agent2` remain ignored and must never be
committed.

## Prerequisites

1. Start the isolated stack with `npm run docker:isolated:up`.
2. Confirm `.env.agent2` targets Docker project `olrigbank2` and PostgreSQL port
   `5434`.
3. Set `AIRBNB_IMPORT_ENCRYPTION_KEY` to a private 32-byte AES key encoded as 64
   hexadecimal characters. Preserve that key securely while encrypted access
   codes are retained.
4. Confirm all expected PDFs are present in the three ignored source folders.

Load the local environment for commands that connect from the host:

```bash
set -a
source .env.agent2
set +a
export DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:${POSTGRES_PORT}/${POSTGRES_DB}"
```

## Dry run and import

Inventory and parse every source PDF before writing to PostgreSQL:

```bash
npm --prefix site run airbnb:verify -- --source-only
```

The command prints aggregate counts, checks all 155 hashes are unique and stops
if the reviewed baseline has changed. It does not print review text, messages,
names, financial values, confirmation codes or access codes.

Apply migrations, then run the bounded import steps in order:

```bash
npm --prefix site run db:migrate
npm --prefix site run reviews:import-private
npm --prefix site run airbnb:import-bookings
npm --prefix site run airbnb:reconcile-reviews
npm --prefix site run airbnb:verify
```

Run the three import/reconciliation commands a second time. An unchanged source
set must add no documents, reviews, reservations or reconciliation links. The
final verifier compares every source hash with PostgreSQL and enforces review,
reservation, provenance, category, conversation and financial invariants.

## Conflicts and restart

Importers use transactions and record a failed batch with a non-sensitive error
code. They never overwrite conflicting canonical evidence.

When a conflict occurs:

1. Stop; do not edit an accepted database row to make the import pass.
2. Record the application commit, failed batch ID, error code and source
   external ID. Do not copy private extracted content into an issue or log.
3. Compare the protected PDFs and their SHA-256 hashes locally.
4. Correct the parser or remove an unintended source capture, as appropriate.
5. Re-run the same importer. Earlier committed batches remain valid and
   idempotency prevents duplication.

Manual review/reservation decisions survive reconciliation reruns. A manual
confirmation can supersede an automatic confirmation only through the audited
decision function; another manual confirmation is never silently replaced.

## Backup and restore drill

Create a custom-format backup without stopping the primary instance:

```bash
npm run docker:isolated:backup
```

For a drill, restore into a newly named temporary database in the Agent 2
PostgreSQL container, never over the working database. Run `airbnb:verify`
against that database URL and compare aggregate counts and the sorted source
hash set. Drop the temporary database only after verification. The 2 September
2026 drill restored 155 documents, 52 reviews, 89 reservations, 1,084
conversation entries, 178 financial summaries and 52 confirmed links; its
source-hash fingerprint matched the working Agent 2 database.

Use `npm run docker:isolated:restore -- <dump>` only for a deliberate full
replacement of the isolated working database. It stops the Agent 2 site during
restore; it does not target the primary Docker project.

## Retention and safe cleanup

- Keep source PDFs, dumps and encryption keys outside Git with access limited to
  authorised operators.
- Suggested access-code ciphertext has an expiry timestamp based on checkout.
  Remove expired ciphertext according to the property's access-control policy;
  retain the non-secret reservation and provenance record.
- Before any bulk cleanup, take an isolated backup and verify the exact target
  database and row counts. Prefer deleting an import batch only in a disposable
  restored database; provenance rows intentionally restrict unsafe deletion.
- Delete temporary restore databases and drill dumps when the drill finishes.
- Never remove the Agent 2 volume as part of routine restart. `docker:isolated:down`
  preserves it unless an operator explicitly requests volume deletion.
