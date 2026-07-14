# Airbnb calendar and provisional booking service

## Scope

This phase provides a small booking engine inside Soccotash. It supports:

- importing blocked dates from one or more Airbnb iCal feeds per property;
- storing imported blocks in PostgreSQL;
- checking availability from the public booking page;
- saving guest provisional booking requests;
- token-protected calendar synchronisation and booking reports.

It does not yet provide pricing, payment, automatic acceptance, email notifications, guest accounts, or write changes back to Airbnb.

## Data flow

1. Airbnb iCal URLs are stored only in environment variables.
2. Soccotash fetches and parses each `.ics` feed server-side.
3. Imported Airbnb date ranges replace the previous imported set for that property in one database transaction.
4. `/book/` refreshes a property calendar when the stored import is more than 30 minutes old.
5. The guest checks a date range.
6. Before insertion, PostgreSQL locks booking changes for that property and checks both Airbnb blocks and existing pending/approved provisional requests.
7. A conflict-free request is stored with `pending` status and returned with a UUID reference.

The request is not a confirmed reservation.

## Airbnb environment variables

Use these names:

```text
AIRBNB_MAIN_HOUSE_ICAL_URLS
AIRBNB_COTTAGE_ICAL_URLS
```

Each value can contain one URL or several URLs separated by commas or new lines. The older singular names ending in `_URL` remain accepted temporarily for compatibility.

Never commit Airbnb iCal export URLs. Anyone holding an export URL can retrieve the associated calendar feed. Regenerate any URL that has previously been committed or shared.

## Run the complete stack locally

From the repository root:

```bash
cp .env.example .env
```

Edit `.env`, then run:

```bash
docker compose up --build -d
```

The first start will:

1. create the PostgreSQL container and persistent volume;
2. wait for PostgreSQL to become healthy;
3. apply every unapplied SQL migration in `site/db/`;
4. start the Astro/Node server;
5. expose the site at `http://localhost:8080`.

Check service state:

```bash
docker compose ps
```

Follow application logs:

```bash
docker compose logs -f site
```

## Test Airbnb extraction

Force a complete import for all enabled properties:

```bash
docker compose --profile tools run --rm calendar-sync
```

Expected output includes, for each property:

- property ID;
- whether synchronisation succeeded;
- number of configured feeds;
- number of imported events.

One property failing does not prevent the other property from being attempted.

The public availability endpoint also refreshes a calendar automatically when it is stale.

## Test a provisional request

Open:

```text
http://localhost:8080/book/
```

Choose a property and dates, check availability, enter test guest details, and submit the provisional request.

Then inspect stored imports and requests:

```bash
docker compose --profile tools run --rm booking-report
```

The report is retrieved through the same token-protected admin API used on Render. It includes guest contact details and must therefore be treated as private.

## Direct API testing

Force a sync:

```bash
curl -X POST http://localhost:8080/api/admin/sync-calendars/ \
  -H "Authorization: Bearer $CALENDAR_SYNC_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{}'
```

Retrieve the private report:

```bash
curl http://localhost:8080/api/admin/booking-report/ \
  -H "Authorization: Bearer $CALENDAR_SYNC_TOKEN"
```

When commands are run in a new shell, load the value safely from `.env` rather than copying the token into shell history.

## PostgreSQL persistence

The Compose volume is named `postgres-data` within the Soccotash Compose project. Normal rebuilds and `docker compose down` preserve it.

This destructive command deletes the local database completely:

```bash
docker compose down -v
```

Use it only when intentionally resetting all imported calendars and provisional requests.

## Database migrations

The container entrypoint runs `npm run db:migrate` before starting the application. Applied migrations are recorded in `schema_migrations` with a checksum.

Never edit a migration after it has been deployed. Add a new numbered SQL file instead, for example:

```text
site/db/003_add_booking_note.sql
```

## Render testing

Set these environment values on the Render web service:

```text
AIRBNB_MAIN_HOUSE_ICAL_URLS
AIRBNB_COTTAGE_ICAL_URLS
CALENDAR_SYNC_TOKEN
```

`DATABASE_URL` is supplied automatically by the Render PostgreSQL database. `DATABASE_SSL=true` is defined in `render.yaml`.

After deployment, test the public page:

```text
https://soccotash.onrender.com/book/
```

Force a Render import from a trusted terminal:

```bash
curl -X POST https://soccotash.onrender.com/api/admin/sync-calendars/ \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{}'
```

Retrieve the Render booking report similarly:

```bash
curl https://soccotash.onrender.com/api/admin/booking-report/ \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Current operational limitations

- Airbnb iCal is not real-time and contains blocked date ranges rather than a full Airbnb booking API.
- The free Render PostgreSQL plan is temporary and unsuitable for permanent production guest records.
- No automatic email is sent when a provisional request is created.
- Requests are reviewed through the private report or directly in PostgreSQL; an authenticated administration interface is a later phase.
- No automatic block is exported back to Airbnb yet.
