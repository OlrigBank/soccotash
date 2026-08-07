# Local Guide backup, export and recovery

PostgreSQL is the only runtime source for the Local Guide. Recovery must never reintroduce the retired content collection.

## Routine protection

1. Create the normal full PostgreSQL custom-format backup with `./backup-db.bash` before every production migration and on the documented schedule.
2. Create a human-inspectable Local Guide export from the same database:

   ```bash
   cd site
   DATABASE_URL='postgresql://…' npm run local-guide:export -- ../backups/local-guide.json
   ```

3. Store the database dump and JSON export together, encrypted and access-controlled. Verify that the JSON has `format: "olrigbank-local-guide"` and `version: 1`.

The JSON deliberately excludes password hashes and planner/booking credentials. It includes stable IDs, slugs, aliases, lifecycle state, every revision, publication pointers, Local Guide events, administrator attribution metadata, and contribution provenance.

## Full database restore

Use the full database backup whenever the complete application database is unavailable or corrupt:

```bash
./restore-db.bash backups/olrigbank-YYYYMMDD-HHMMSS.dump
docker compose up --build -d site
curl -fsS http://127.0.0.1:8080/api/health
```

Then verify the Local Guide index, canonical and alias URLs, administration, planner references, and the published example plan. A rollback of application code must use a database version compatible with that code; never run an older image against a schema it does not understand.

## Local Guide-only restore

The JSON restore is for a migrated database whose Local Guide tables are empty. It refuses a non-empty target.

```bash
cd site
DATABASE_URL='postgresql://…' npm run db:migrate
DATABASE_URL='postgresql://…' npm run local-guide:restore -- ../backups/local-guide.json
```

Restored administrator identities retain attribution but use a disabled recovery password value. Reset or create an administrator through the documented `admin:create` command rather than attempting to recover credentials from the export.

## Failure response

- Stop editorial mutations while diagnosing an inconsistent export or restore.
- Keep the current database and backup immutable; restore into a separate database first.
- If migration startup fails, retain the logs, restore the pre-migration dump, and redeploy the last compatible application revision.
- If only a Local Guide publication is wrong, use immutable revision history and rollback-by-copy instead of database surgery.
- Do not delete or reuse slugs to repair links. Canonical slug changes must retain aliases.
- Record the incident, backup identifiers, application commit, migration level, validation results, and operator.

## Retention policy

Until a separately approved deletion policy exists:

- archive entries instead of deleting them;
- retain all revisions, aliases, publication events, rejected and withdrawn contribution candidates;
- retain consent and attribution evidence with contribution-authored revisions;
- retain migration SQL, baseline and reconciliation reports in version control;
- retain replaced image files while any revision or operational backup may reference them;
- retain planner stable references and prevent deletion of referenced entries through foreign keys.

## Recovery acceptance

A recovery drill passes only when export reconciliation is exact, canonical and alias URLs resolve, unpublished/archived entries remain private, planner references resolve by stable ID, administration can create a new private revision, and the full automated test suites pass against the restored database.
