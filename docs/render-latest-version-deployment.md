# Deploying the latest Soccotash version to Render

**Archive reviewed:** `soccotash-render-deploy-no-images(7).zip`  
**Review date:** 14 July 2026

This guide describes how to deploy this specific version of the Soccotash / Olrig Bank website to Render while preserving the existing images, Render service, and PostgreSQL data.

## 1. What this version deploys

The repository now defines a two-resource Render deployment:

1. **`soccotash-site`** — a Docker web service built from `site/Dockerfile`.
2. **`soccotash-bookings`** — a managed Render PostgreSQL database.

The web service is no longer just a static Astro build. It runs Astro in Node standalone/server mode and provides:

- the public website;
- `/book/` and the booking calendar;
- Airbnb iCal availability imports;
- provisional booking requests stored in PostgreSQL;
- authenticated calendar-sync and booking-report endpoints;
- a database-aware health check at `/api/health/`.

The container startup sequence is:

```text
wait for PostgreSQL
→ apply all unapplied SQL migrations
→ start the Astro Node server on port 8080
```

The Render configuration is in the repository-root `render.yaml` file.

## 2. Important checks before changing the repository

### 2.1 Preserve the image files

This is deliberately a **no-images archive**. It contains the image directory structure but not the `.png`, `.jpg`, `.jpeg`, or other property and local-guide image files.

Do not delete the existing contents of:

```text
site/public/media/images/
```

The image files already present in the GitHub repository must remain there. Extract or synchronise this archive over the existing repository while protecting that directory.

### 2.2 Preserve the existing Render database

If a Render PostgreSQL database is already being used, do not replace it. The migrations in this version are additive and are designed to run against the existing database.

The two migrations are:

```text
site/db/001_booking.sql
site/db/002_sync_metadata.sql
```

After a migration has been applied, do not edit that migration file. Add a new numbered migration for later schema changes.

### 2.3 Check the existing Render resource names

Before creating or syncing a Blueprint, open the Render Dashboard and note the exact names of:

- the existing web service;
- the existing PostgreSQL database;
- any existing Blueprint that manages them.

The supplied `render.yaml` defines:

```text
Web service: soccotash-site
Database:    soccotash-bookings
```

However, the configured public URL is:

```text
https://soccotash.onrender.com
```

If the existing service is actually named `soccotash`, do not blindly create a new Blueprint from the supplied file. Render may create a second service, possibly with a suffixed name. Either make the Blueprint resource name match the existing service exactly or continue updating the existing service manually.

Cancel the Blueprint deployment if its preview proposes duplicate or suffixed resources instead of updating the existing ones.

## 3. Safely install the archive into the local Git repository

The following method replaces old tracked source files but protects Git metadata, local settings, backups, and existing images.

Adjust the archive and repository paths if necessary:

```bash
ARCHIVE="$HOME/Downloads/soccotash-render-deploy-no-images.zip"
REPO="$HOME/WebstormProjects/soccotash"
STAGE="$(mktemp -d)"

unzip "$ARCHIVE" -d "$STAGE"

rsync -a --delete \
  --filter='P .git/***' \
  --filter='P .idea/***' \
  --filter='P .env' \
  --filter='P site/.env' \
  --filter='P backups/***' \
  --filter='P airbnb-*.ics' \
  --filter='P site/public/media/images/***' \
  "$STAGE/" "$REPO/"

rm -rf "$STAGE"
cd "$REPO"
chmod +x ./*.bash site/docker-entrypoint.sh
```

Confirm that the existing image files are still present:

```bash
find site/public/media/images -type f | head -20
```

Then inspect all changes before committing:

```bash
git status
git diff --stat
git diff
```

Pay particular attention to any deleted image files. There should be no unintended image deletions.

## 4. Validate the version locally

### 4.1 Source checks

Run the same checks used by the Docker build:

```bash
cd "$HOME/WebstormProjects/soccotash"
npm --prefix site ci
npm --prefix site run check
npm --prefix site run build
```

A deployment should not be pushed if either `astro check` or `astro build` fails.

### 4.2 Optional full Docker test

Create the local environment file if it does not already exist:

```bash
cp .env.example .env
```

Edit `.env` and set:

```dotenv
POSTGRES_DB=soccotash
POSTGRES_USER=soccotash
POSTGRES_PASSWORD=<strong-local-password>
SOCCOTASH_PORT=8080
CALENDAR_SYNC_TOKEN=<long-random-token>
AIRBNB_MAIN_HOUSE_ICAL_URLS=<main-house-Airbnb-iCal-URL>
AIRBNB_COTTAGE_ICAL_URLS=<cottage-Airbnb-iCal-URL>
```

A suitable token can be generated with:

```bash
openssl rand -hex 32
```

Start a clean local stack:

```bash
docker compose down --remove-orphans
docker compose up --build -d
docker compose ps
docker compose logs -f site
```

Expected startup messages include:

```text
PostgreSQL is ready.
Applied migration 001_booking.sql.
Applied migration 002_sync_metadata.sql.
Booking database migrations are complete.
```

On later starts, already applied migrations are skipped.

Test locally:

```bash
curl -fsS http://localhost:8080/api/health/
npm run docker:sync
npm run docker:report
```

Open:

```text
http://localhost:8080/
http://localhost:8080/book/
```

## 5. Commit and push to GitHub

Commit the complete reviewed change, including this deployment guide if it has been added under `docs/`:

```bash
cd "$HOME/WebstormProjects/soccotash"
git add -A
git commit -m "Deploy booking calendar and Render database integration"
git push origin main
```

Replace `main` if Render is connected to a different branch.

## 6. Recommended procedure for the existing Render deployment
---------
Use this procedure when `https://soccotash.onrender.com` already exists.

### 6.1 If the service and database are already managed by a Blueprint

1. Open the existing Blueprint in the Render Dashboard.
2. Confirm that its linked repository and branch are correct.
3. Confirm that the Blueprint preview identifies the existing web service and database rather than proposing new ones.
4. Check the Blueprint resource names against the actual Render resource names.
5. Push the commit or select **Manual Sync** if automatic sync is disabled.
6. Review the proposed changes and start the sync.

Render normally retains values for existing environment variables declared with `sync: false`, but verify the secret values after the sync.

### 6.2 If the existing web service was created manually

First check its current runtime.

- If it is already a **Docker** web service, update that service rather than creating a second web service.
- If it is still a native **Node** service, Render does not provide a normal Dashboard control for changing the runtime. Change it through a Blueprint or the Render API, or create a replacement Docker service and migrate the domain only after the replacement has passed all tests.

For an existing Docker service, set or verify these settings:

```text
Repository:          the soccotash GitHub repository
Branch:              main, or the branch used for deployment
Root directory:      site
Dockerfile:          Dockerfile
Health check path:   /api/health/
Auto deploy:         enabled if desired
```

Because the root directory is `site`, the Dockerfile value is `Dockerfile`, not `site/Dockerfile`.

Set or verify these environment variables:

```text
PORT=8080
DATABASE_URL=<internal Render PostgreSQL connection string>
DATABASE_SSL=true
AIRBNB_MAIN_HOUSE_ICAL_URLS=<secret value>
AIRBNB_COTTAGE_ICAL_URLS=<secret value>
CALENDAR_SYNC_TOKEN=<secret value>
BOOKING_SERVICE_URL=https://soccotash.onrender.com
```

Use the database's **internal** connection URL when the web service and database are in the same Render workspace and region.

If no database exists yet, create a Render PostgreSQL database first, preferably with:

```text
Name:          soccotash-bookings
Database name: soccotash
User:          soccotash
Region:        the same region as the web service
```

Then place its internal connection string in `DATABASE_URL`.

Select **Manual Deploy → Deploy latest commit** after saving the settings.

## 7. Procedure for a new Render deployment from scratch

Use this only when there is no existing service or database to preserve.

1. Push the repository to GitHub.
2. In Render, choose **New → Blueprint**.
3. Select the GitHub repository and deployment branch.
4. Leave the Blueprint path as `render.yaml` because it is in the repository root.
5. Review the proposed resources:
   - `soccotash-site` Docker web service;
   - `soccotash-bookings` PostgreSQL database.
6. Enter values for all variables marked `sync: false`:
   - `AIRBNB_MAIN_HOUSE_ICAL_URLS`;
   - `AIRBNB_COTTAGE_ICAL_URLS`;
   - `CALENDAR_SYNC_TOKEN`.
7. Deploy the Blueprint.
8. After Render assigns the service URL, check `BOOKING_SERVICE_URL`.

If the assigned URL is not `https://soccotash.onrender.com`, change the value in `render.yaml` before deployment, or change the Render environment variable and ensure a later Blueprint sync will not overwrite it.

Multiple Airbnb feeds for one property may be supplied as comma-separated URLs or as separate lines in the environment-variable value.

## 8. Monitor the Render deployment

Open the deploy logs. The build stage should run:

```text
npm ci
npm run check
npm run build
```

The runtime stage should then report:

```text
PostgreSQL is ready.
Booking database migrations are complete.
```

The deployment becomes healthy only when this endpoint returns a successful response and can query PostgreSQL:

```text
/api/health/
```

A healthy response is:

```json
{"status":"ok","database":"ok"}
```

Check it from Mint:

```bash
curl -i https://soccotash.onrender.com/api/health/
```

If the deploy fails, inspect the Render logs for one of these likely causes:

- `DATABASE_URL is required` — database connection variable missing;
- repeated `Waiting for PostgreSQL` — wrong URL, wrong region, unavailable database, or SSL configuration problem;
- migration checksum error — an already applied migration file was edited;
- `AIRBNB_... is not configured` — calendar URL missing when a sync is requested;
- health-check failure — application could not start or query PostgreSQL;
- build failure in `astro check` — TypeScript or content-schema problem.

## 9. Perform the first production calendar sync

The Render Blueprint does **not** define a scheduled cron job. The availability API automatically refreshes a property's Airbnb calendars when the stored calendar is more than 30 minutes old, but an explicit first sync is recommended immediately after deployment.

Free Render web services do not provide Dashboard shell access or one-off jobs, so call the authenticated HTTP endpoint from the local Mint terminal.

Set the token locally for the current terminal session:

```bash
export CALENDAR_SYNC_TOKEN='<the same token stored in Render>'
```

Run the sync:

```bash
curl -fsS \
  -X POST \
  -H "Authorization: Bearer $CALENDAR_SYNC_TOKEN" \
  -H "Content-Type: application/json" \
  https://soccotash.onrender.com/api/admin/sync-calendars/ \
  -d '{}'
```

A successful response contains one result for `main-house` and one for `cottage`, with `ok: true`, the number of feeds, and the number of imported unavailable-date blocks.

Retrieve the protected booking report:

```bash
curl -fsS \
  -H "Authorization: Bearer $CALENDAR_SYNC_TOKEN" \
  https://soccotash.onrender.com/api/admin/booking-report/
```

Never put `CALENDAR_SYNC_TOKEN` into Git, a Markdown file, screenshots, or a public URL.

## 10. Final acceptance test

Complete all of the following:

1. Open the home page and check that existing property and local-guide images still display.
2. Open `/listings/` and both listing pages.
3. Open `/book/`.
4. Switch between **Olrig Bank** and **Olrig Bank Cottage**.
5. Confirm that Airbnb reservations appear as unavailable dates.
6. Confirm the two-night minimum and maximum guest limits:
   - main house: maximum 10 guests;
   - cottage: maximum 4 guests.
7. Submit a clearly identifiable test provisional request.
8. Retrieve `/api/admin/booking-report/` with the bearer token and confirm that the test request appears.
9. Check that `/api/health/` still returns HTTP 200.
10. Review Render logs for unexpected errors.

Use obviously artificial test contact details. This version has no booking-management screen, so remove the test row later with an authorised database tool if a clean production report is required.

## 11. Updating the site after this deployment

For normal code or Pages CMS content changes:

```bash
git add -A
git commit -m "Describe the site update"
git push origin main
```

With automatic deployment enabled, Render builds and deploys the new commit. The PostgreSQL database remains separate from the Docker container, so its data survives web-service rebuilds and container replacements.

Every container start reruns the migration runner, but only unapplied migration files are executed.

## 12. Free-plan warning

The supplied `render.yaml` selects the Free instance type for both the web service and PostgreSQL database.

As of July 2026, Render documents these important limitations:

- a Free Render PostgreSQL database expires 30 days after creation;
- it has a fixed 1 GB capacity;
- it has no managed backups;
- only one Free PostgreSQL database can be active per workspace;
- a Free web service can spin down when idle;
- Free web services do not provide Dashboard/SSH shell access or one-off jobs.

The Free database is suitable for deployment testing, not as the sole long-term store of real guest data. Upgrade the database before the expiration date or before relying on it for live bookings.

## 13. Files that control this Render deployment

```text
render.yaml                         Render Blueprint
site/Dockerfile                     Docker build and runtime image
site/docker-entrypoint.sh           wait, migrate, then start
site/astro.config.mjs               Astro Node standalone configuration
site/db/001_booking.sql             initial booking schema
site/db/002_sync_metadata.sql       calendar import metadata
site/scripts/wait-for-db.mjs        startup database readiness check
site/scripts/migrate.mjs            checksum-protected migration runner
site/src/pages/api/health/index.ts   Render health endpoint
site/src/pages/api/admin/           protected sync and report endpoints
site/src/data/booking/properties.yml property limits and calendar settings
```

## 14. Official Render references

- Render Blueprints: <https://render.com/docs/infrastructure-as-code>
- Blueprint YAML reference: <https://render.com/docs/blueprint-spec>
- Docker/web services: <https://render.com/docs/web-services>
- Render Postgres connections: <https://render.com/docs/postgresql-creating-connecting>
- Health checks: <https://render.com/docs/health-checks>
- Default environment variables: <https://render.com/docs/environment-variables>
- Free-plan limitations: <https://render.com/docs/free>
