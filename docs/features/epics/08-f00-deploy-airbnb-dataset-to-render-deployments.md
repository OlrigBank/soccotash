# E08 — Deploy Airbnb Dataset to Render Deployments

## Status

Proposed. No Airbnb dataset has been written to either Render development or
production by this epic.

## Epic summary

Deploy the private Airbnb dataset produced by E06, and exposed to administrators
by E07, to the Render development and production PostgreSQL databases through a
controlled, repeatable and verified import. Development (`soccotash`) must be
completed and accepted before production (`olrigbankweb`) is changed.

This epic continues:

- [`E06 — Storing Exported Airbnb Data`](e06-f00-storing-exported-airbnb-data.md);
  and
- [`E07 — Airbnb Administration Dashboard`](e07-f00-airbnb-admin-dashboard.md).

Deploying the application code and migrations creates the `airbnb_*` schema but
does not transfer the private dataset. Dataset promotion is a separate
operational action performed from a trusted checkout containing the ignored
PDF source material beneath `output/pdf/`.

## Source baseline

The verified local dataset currently contains:

- 155 source PDF documents;
- 52 reviews;
- 89 reservations;
- 1,084 conversation entries;
- 178 financial summaries;
- 52 confirmed review-to-reservation links; and
- 6 proposed review-to-reservation links.

These values are the reviewed rollout baseline. The verification command must
compare the source files, their SHA-256 hashes and the destination database
rather than relying only on row counts.

## Desired outcome

1. Provide a guarded and documented procedure for promoting only the Airbnb
   dataset into an existing Render database.
2. Deploy and validate the schema and dataset in Render development first.
3. Obtain development acceptance before making any production data change.
4. Back up each destination immediately before importing data.
5. Import from the private source PDFs using the existing idempotent importers.
6. Use environment-specific encryption keys and securely configured database
   credentials.
7. Verify source hashes, relationships, expected records and administrative UI
   behaviour after each import.
8. Preserve existing bookings, administrators, sessions and all other data in
   each destination database.
9. Record the deployed application revision, import result and verification
   result for each environment.

## Deployment boundary

The whole local PostgreSQL database must not be restored into either Render
database. A complete restore could overwrite existing application data and
would copy local-only records such as disposable administrators, sessions,
test bookings and development state.

Only the `airbnb_*` domain is in scope. The preferred mechanism is to run the
existing source import pipeline from the trusted local checkout against the
destination database. The importers use immutable document hashes and Airbnb
identifiers to make unchanged imports repeatable and reject conflicting
evidence.

The private PDFs are not deployed to Render and are not stored as binaries in
PostgreSQL. Database provenance retains their private relative paths, hashes
and parsed evidence for local audit purposes only. Links or paths to those PDFs
will never be used by either the development or production deployment, and no
deployed administration page or service may rely on the PDFs being available.

Future Airbnb dataset updates will be captured and processed locally from the
private source material. After local parsing, validation and verification, the
resulting database updates will be pushed directly from the trusted local
workstation to the separately authorised Render development and production
databases. Source PDFs, PDF links and local filesystem access are never part of
the deployed update mechanism.

## Environment model

### Trusted import workstation

The rollout commands run from a trusted checkout that contains the ignored
`output/pdf/` source directories and the required PDF extraction tools. It
connects to a Render database using that database's external PostgreSQL URL and
TLS.

Database URLs, encryption keys, backups and source documents must never be
committed, printed in logs or added to deployment artifacts.

### Render application services

The deployed application continues to use its normal Render database
connection. Application startup applies ordered migrations, including the E06
Airbnb migrations. `DATABASE_SSL=true` remains enabled where required.

The following rollout order is mandatory:

1. Render development application and database (`soccotash`).
2. Development verification and administrative acceptance.
3. Render production application and database (`olrigbankweb`).
4. Production verification and smoke testing.

## Development rollout

1. Identify and record the exact development application revision and target
   database. Confirm that no production URL is being used.
2. Deploy the application revision to `soccotash` and allow the normal migration
   runner to apply migrations `055`, `056` and `057`.
3. Confirm application health and inspect the migration state and initial
   `airbnb_*` table counts.
4. Create a recoverable backup of the development database before modifying
   data.
5. Configure the trusted workstation with the development database's external
   TLS URL and a development-specific Airbnb import encryption key.
6. Run review import, booking import, reconciliation and complete verification.
7. Run the relevant integration, privacy and browser regression tests against
   the development deployment.
8. Walk through the Airbnb administration screens and record development
   acceptance before scheduling production.

The underlying command sequence is:

```bash
export DATABASE_URL='<Render development external database URL>'
export DATABASE_SSL=true
export AIRBNB_IMPORT_ENCRYPTION_KEY='<development 64-hex-character key>'
export AIRBNB_IMPORT_ENCRYPTION_KEY_VERSION=1

npm --prefix site run db:migrate
npm --prefix site run reviews:import-private
npm --prefix site run airbnb:import-bookings
npm --prefix site run airbnb:reconcile-reviews
npm --prefix site run airbnb:verify
```

The real values must come from an approved secret source. They must not be
placed in this document, shell history, checked-in environment files or command
output retained as an artifact.

## Production rollout

Production rollout is authorised separately and only after the development
acceptance record is complete.

1. Confirm that `olrigbankweb` will deploy the exact revision accepted in
   development.
2. Confirm production database health, backup/PITR availability and sufficient
   capacity.
3. Take a fresh production backup and record how it would be restored.
4. Prevent application deployment and dataset import from running concurrently.
5. Deploy the accepted application revision and confirm the migrations and
   health check.
6. Configure the trusted workstation with the production external TLS database
   URL and a production-specific encryption key.
7. Run the same import, reconciliation and verification commands used in
   development.
8. Compare the verified results with the reviewed source baseline.
9. Perform authenticated administration smoke tests and confirm that public
   routes expose none of the imported data.
10. Record the production revision, import batch identifiers, verification
    result and completion time without recording private guest data or secrets.

Development and production must use different encryption keys. The relevant
key must also be configured as a secret on its Render application service so
future authorised functionality can read encrypted values. Ordinary E07
screens must continue to exclude and never decrypt access codes.

## Required rollout tooling

Before the first Render data import, add a guarded command or script that:

- accepts an explicit `development` or `production` target;
- defaults to a dry run and requires an additional explicit production flag;
- refuses ambiguous, missing or local database destinations;
- displays only a non-secret target identity for operator confirmation;
- checks the required migrations before import;
- verifies that the private source inventory matches the reviewed baseline;
- checks whether the target is empty, already complete or conflicting;
- runs the existing idempotent import and reconciliation steps;
- creates a non-sensitive before/after manifest of counts, hashes and import
  batch identifiers;
- runs `airbnb:verify` and fails the rollout on any mismatch; and
- never logs database URLs, encryption keys, guest content, financial details,
  access codes or raw parsed payloads.

The rollout documentation must include backup, recovery, failure handling and
operator sign-off steps. A failed import must be investigated rather than
followed by a whole-database restore from the local environment.

## Security and privacy requirements

- Use the Render external database URL only from the trusted import workstation
  and require TLS.
- Use the Render internal/private database connection for the deployed service
  where the service and database topology permits it.
- Store environment-specific encryption keys and database credentials only as
  approved secrets.
- Do not commit the PDFs, parsed extracts, manifests containing guest data or
  database backups.
- Process future source captures locally and promote only their verified
  database updates to Render; never deploy or depend upon PDF links.
- Do not copy local administrators, sessions, test records or unrelated domain
  tables.
- Do not expose imported information through public pages, APIs, generated
  artifacts, telemetry or normal application logs.
- Do not send email, WhatsApp or any other guest notification during rollout.
- Keep reconciliation decisions auditable and preserve existing manual
  decisions on repeat runs.

## Failure and recovery

- Stop immediately if the target identity, schema version or source inventory
  differs from the approved rollout record.
- Treat a conflicting document hash or external identity as a data issue; do
  not overwrite the accepted row.
- If an importer fails, retain its non-sensitive batch diagnostics, determine
  whether its transaction committed, and run verification before retrying.
- Use the destination's pre-import backup only when the impact of committed
  changes requires restoration and the restoration scope has been reviewed.
- Never restore the complete local Agent 2 database over a Render database.
- Keep production unavailable for the minimum necessary period; because this
  import is additive and administration-only, downtime is not expected unless
  preflight testing identifies migration locking or capacity risk.

## Acceptance criteria

1. The rollout tooling cannot target production accidentally and does not
   expose secrets or private content.
2. A recoverable pre-import backup exists for each modified Render database.
3. The accepted application revision and E06 migrations are present before
   importing data.
4. Render development passes complete Airbnb verification against all 155 PDFs
   and the expected normalized dataset.
5. The development administration UI and privacy regressions pass and an
   explicit development acceptance is recorded.
6. Production is not changed until separately authorised after development
   acceptance.
7. Render production passes the same source, database, relationship and privacy
   verification as development.
8. Existing application data and booking behaviour remain unchanged in both
   environments.
9. Re-running the rollout against an already complete destination adds no
   duplicate canonical records and preserves accepted reconciliation results.
10. Deployment records contain revision, timing, batch IDs and non-sensitive
    verification results, but no guest data, access codes, credentials or
    encryption keys.

## Out of scope

- Copying or restoring the complete local database into Render.
- Committing or deploying the private Airbnb PDFs.
- Serving, linking to or otherwise using source PDFs in either Render
  deployment.
- Exposing Airbnb data through public application routes.
- Combining imported Airbnb history with the live direct-booking tables.
- Changing or contacting Airbnb guests.
