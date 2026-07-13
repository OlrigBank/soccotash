# Airbnb calendar and provisional booking service

## Selected approach

This phase uses a small booking engine inside the Astro application. It stores availability and provisional requests in PostgreSQL. It is deliberately narrower than a full property-management system: no payment, automatic confirmation, pricing engine, guest account or Airbnb API is included.

## Flow

1. An Airbnb iCal export URL is stored in a Render secret environment variable for each listing.
2. The server fetches and parses the `.ics` feed server-side.
3. Imported date ranges are stored as non-public booking blocks. Event titles and guest details are not exposed.
4. `/book/` asks the availability API to refresh a calendar when its stored copy is more than 30 minutes old.
5. A guest may submit a provisional request only after a fresh conflict check.
6. The request is saved with `pending` status. It does not automatically confirm a stay or change Airbnb.

## Installation

```bash
npm install --prefix site
createdb soccotash
cp site/.env.example site/.env
npm --prefix site run db:migrate
npm --prefix site run dev -- --host 0.0.0.0 --port 4322
```

## Required Render secrets

- `DATABASE_URL`
- `AIRBNB_MAIN_HOUSE_ICAL_URL`
- `AIRBNB_COTTAGE_ICAL_URL`
- `CALENDAR_SYNC_TOKEN`
- `BOOKING_SERVICE_URL`

Never add actual iCal URLs to Git, Pages CMS or browser code. Anyone possessing an export URL can retrieve the calendar feed.

## Manual or scheduled refresh

The public availability endpoint refreshes stale feeds on demand. A separate scheduler can also run:

```bash
npm --prefix site run sync:calendars
```

On Render, create a Cron Job using the same repository and set the command above. Render does not offer cron jobs on its free compute plan, so this is intentionally not created automatically by `render.yaml`.

## Current limitations

- iCal is not real-time; it can only be as current as Airbnb's exported feed.
- Provisional requests currently require administrative review directly in PostgreSQL.
- Email notifications, an authenticated admin screen, pricing, payments, approval and a Soccotash `.ics` export back to Airbnb belong to the next phase.
- If Olrig Bank and the Cottage overlap physically, Airbnb's own linked-listing calendar rules must still be configured correctly.
