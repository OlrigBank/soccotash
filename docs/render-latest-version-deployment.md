# Deploying the latest Soccotash version to Render

**Archive reviewed:** `soccotash-render-deploy-no-images(7).zip`  
**Review date:** 14 July 2026


## Confirmed current Render state

The existing Render setup has now been confirmed as:

```text
Project:      soccotash
Environment:  Production
Resource:     soccotash
Status:       Deployed
Runtime:      Static
Region:       global
```

This changes the deployment procedure significantly.

The existing `soccotash` resource is a **Render Static Site**. It cannot run the latest application's Node server, API endpoints, database migrations, PostgreSQL booking storage, health check, or Airbnb calendar-sync endpoints. The latest archive uses Astro `output: 'server'` with the Node standalone adapter and therefore needs a **Render Web Service**.

Do **not** attempt to treat the current Static Site as the target of the Docker deployment. The safe migration is:

```text
existing Static Site remains live
→ disable its automatic deployments
→ create a new Docker Web Service
→ create and connect PostgreSQL
→ test the new service
→ move the public/custom domain to the new service
→ retire the old Static Site
```

A Render project is an organisational container and can contain a Static Site, Web Service, and PostgreSQL database together. The new resources can therefore be placed in the existing `soccotash` project and its `Production` environment.

This guide describes how to deploy this specific version of the Soccotash / Olrig Bank website to Render while preserving the existing images and keeping the current public site available during the migration.

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


### 2.1 Disable auto-deploy on the existing Static Site

Before pushing this version to the branch used by Render:

1. Open **Project → soccotash → Production → soccotash**.
2. Open the resource's **Settings** page.
3. Find **Auto-Deploy** under **Build & Deploy**.
4. Change it from **On Commit** to **Off**.

This prevents the current Static Site from trying to build the new server-rendered version when the repository is pushed. Leave the currently successful static deployment running while the replacement service is prepared.

The Static Site can still be deployed manually later if a rollback is required.

### 2.2 Preserve the image files

This is deliberately a **no-images archive**. It contains the image directory structure but not the `.png`, `.jpg`, `.jpeg`, or other property and local-guide image files.

Do not delete the existing contents of:

```text
site/public/media/images/
```

The image files already present in the GitHub repository must remain there. Extract or synchronise this archive over the existing repository while protecting that directory.

### 2.3 PostgreSQL is not yet present in the confirmed project

The supplied Render resource list shows only the existing Static Site, so there is no PostgreSQL resource currently visible in the `Production` environment. The Blueprint is therefore expected to create the new `soccotash-bookings` database.

If a database exists elsewhere in the workspace but was not shown in the project view, check it before deploying. A Render workspace can have only one active Free PostgreSQL database, so an existing Free database can prevent the Blueprint from creating another one.

The application applies these migrations to the database:

```text
site/db/001_booking.sql
site/db/002_sync_metadata.sql
```

After a migration has been applied, do not edit that migration file. Add a new numbered migration for later schema changes.

### 2.4 Understand the supplied resource names

The supplied `render.yaml` defines two new resources:

```text
Docker Web Service:  soccotash-site
PostgreSQL database: soccotash-bookings
```

These names do not match the existing Static Site named `soccotash`, so a new Blueprint should propose creating the Web Service and database alongside the old Static Site. That is the desired result for this migration.

Do not cancel merely because the preview says that `soccotash-site` and `soccotash-bookings` are new resources. Cancel only if Render proposes unexpected suffixes, duplicate databases, or resources in the wrong workspace/project.

The supplied Blueprint currently contains:

```yaml
BOOKING_SERVICE_URL: https://soccotash.onrender.com
```

That address belongs to the existing Static Site and is incorrect for the replacement Web Service. Before deploying, change it to the expected new Web Service URL:

```yaml
BOOKING_SERVICE_URL: https://soccotash-site.onrender.com
```

After Render creates the Web Service, verify the actual URL shown at the top of its Dashboard page. If Render assigns a different URL, update `BOOKING_SERVICE_URL` to that exact URL and redeploy.

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

## 6. Deployment procedure for the confirmed Render setup

The existing `soccotash` resource is a Static Site, so this version must be deployed as additional resources before the old resource is retired.

### 6.1 Keep the current Static Site running

Confirm that:

- `soccotash` still shows **Deployed**;
- its public page still opens;
- Auto-Deploy has been turned **Off**;
- any custom domains currently attached to it have been recorded.

Do not delete the Static Site at this stage.

### 6.2 Prepare the Blueprint URL

In the repository-root `render.yaml`, change:

```yaml
      - key: BOOKING_SERVICE_URL
        value: https://soccotash.onrender.com
```

to:

```yaml
      - key: BOOKING_SERVICE_URL
        value: https://soccotash-site.onrender.com
```

Commit this change with the rest of the latest archive.

### 6.3 Create the Blueprint

After the updated repository has been pushed:

1. In the Render Dashboard, select **New → Blueprint**.
2. Connect the `soccotash` GitHub repository.
3. Select the production branch, normally `main`.
4. Use the repository-root `render.yaml` file.
5. Give the Blueprint a clear name such as `soccotash-production`.
6. Review the proposed resources.

The preview should create:

```text
soccotash-site       Web Service / Docker
soccotash-bookings   PostgreSQL
```

The existing Static Site named `soccotash` should remain untouched.

Where Render offers project/environment assignment, select:

```text
Project:      soccotash
Environment:  Production
```

If the Blueprint resources appear outside the project after creation, assign or move them into the existing `soccotash` project and `Production` environment from the Dashboard.

### 6.4 Enter the required secret values

During Blueprint creation, Render asks for the values marked `sync: false`:

```text
AIRBNB_MAIN_HOUSE_ICAL_URLS
AIRBNB_COTTAGE_ICAL_URLS
CALENDAR_SYNC_TOKEN
```

Use the exported Airbnb iCal URLs for the two listings. Generate a strong token locally if one has not already been created:

```bash
openssl rand -hex 32
```

Do not commit the token or Airbnb URLs to Git.

The Blueprint automatically connects `DATABASE_URL` to the newly created `soccotash-bookings` database and sets:

```text
DATABASE_SSL=true
PORT=8080
```

### 6.5 Deploy and verify the replacement service

Deploy the Blueprint and follow the logs for `soccotash-site`.

The Docker build should run:

```text
npm ci
npm run check
npm run build
```

At startup, the container should report that PostgreSQL is ready and that the booking migrations have completed.

Open the actual Web Service URL shown by Render. It is expected to be:

```text
https://soccotash-site.onrender.com
```

Then test:

```bash
curl -i https://soccotash-site.onrender.com/api/health/
```

Expected response:

```json
{"status":"ok","database":"ok"}
```

Also test the home page, listing pages, `/book/`, calendar availability, and the protected calendar-sync/report endpoints before changing any public domain.

### 6.6 Cut over the public address

#### When `olrigbank.co.uk` or another custom domain is attached to the Static Site

1. Confirm the new Web Service is fully healthy.
2. Record the current DNS and custom-domain settings.
3. Remove the custom domain from the old Static Site.
4. Add the same domain to `soccotash-site` under **Settings → Custom Domains**.
5. Follow Render's verification instructions and confirm HTTPS works.
6. Re-test the full site through the custom domain.

The DNS records might already point to Render and therefore might not need changing, but follow the exact instructions Render displays for the new service.

#### When visitors currently use only `https://soccotash.onrender.com`

The replacement Web Service has a different Render subdomain. Use the new Web Service URL as the production address, or attach a custom domain before retiring the old Static Site.

Do not assume that deleting the Static Site will automatically transfer or immediately release `soccotash.onrender.com` to the new Web Service.

### 6.7 Retire the old Static Site

Only after the new service and public domain have passed the acceptance tests:

1. Keep a note of the old Static Site's settings for rollback.
2. Confirm that all traffic reaches the Docker Web Service.
3. Delete or suspend the old Static Site named `soccotash`.
4. Confirm that the `soccotash` project now contains the production Web Service and PostgreSQL database.

Do not re-enable Auto-Deploy on the old Static Site.

## 7. Alternative procedure for a completely new workspace

This section is not the procedure for the confirmed `soccotash` project. Use it only when deploying into a different Render workspace with no existing resources.

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
curl -i https://soccotash-site.onrender.com/api/health/
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
  https://soccotash-site.onrender.com/api/admin/sync-calendars/ \
  -d '{}'
```

A successful response contains one result for `main-house` and one for `cottage`, with `ok: true`, the number of feeds, and the number of imported unavailable-date blocks.

Retrieve the protected booking report:

```bash
curl -fsS \
  -H "Authorization: Bearer $CALENDAR_SYNC_TOKEN" \
  https://soccotash-site.onrender.com/api/admin/booking-report/
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
