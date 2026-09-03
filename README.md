# Olrig Bank website

Olrig Bank Web is an Astro/Node website with PostgreSQL-backed availability, a visible two-month booking calendar, provisional booking requests, and a versioned administration pricing-rule builder. Content is maintained as Markdown/YAML through Pages CMS or direct Git editing.

## Runtime architecture

### Local development and testing

For migration comparison, Docker Compose runs the Olrig Bank application alongside
the existing Soccotash stack:

- `site`: Astro/Node application
- the existing `soccotash-database-1` remains the sole PostgreSQL owner
- optional one-shot tools for calendar synchronisation and booking reports

### Render

Render runs the same `site/Dockerfile` as a Docker web service and supplies a separate managed Render PostgreSQL database through `DATABASE_URL`.

## First local start

```bash
cp .env.example .env
```

Edit `.env`, using the same PostgreSQL password and calendar settings as the
Soccotash stack. Start Soccotash first, then run:

```bash
docker compose up --build -d
```

Open:

```text
http://localhost:8081/
http://localhost:8081/book/
```

For login testing from another device, set `OLRIGBANK_HTTPS_HOST` in `.env` to
the Docker host's LAN address and start the stack. The HTTPS proxy is then at
`https://<LAN-address>:8443/`. It uses Caddy's local certificate authority, so
install `/data/caddy/pki/authorities/local/root.crt` from the `https` container
as a trusted root on each test device before entering credentials.

The Olrig Bank container joins `soccotash_default` and runs migrations against
the same database. Actions performed in either application are immediately
visible in the other.

## Test the booking service

Force an Airbnb calendar import:

```bash
npm run docker:sync
```

Show calendar import status and the latest provisional requests:

```bash
npm run docker:report
```

Follow the application logs:

```bash
npm run docker:logs
```

Back up the portable PostgreSQL database:

```bash
npm run docker:backup
```

Stop the stack without deleting PostgreSQL data:

```bash
npm run docker:down
```

## Two local development instances

Two copies of the project can run concurrently. They use different Docker
projects, application images, networks, volumes, ports, and PostgreSQL
databases, so development and database migrations in one instance do not alter
the other.

| Instance | Checkout | HTTP                    | HTTPS | PostgreSQL | Docker project |
| --- | --- |-------------------------| --- | --- | --- |
| Primary | `soccotash` | `http://localhost:8081` | port `8443` | `127.0.0.1:5433` | `olrigbank` |
| Agent 2 | `soccotash2` | `http://localhost:8082` | port `8444` | `127.0.0.1:5434` | `olrigbank2` |

The standard `npm run docker:*` commands operate the primary/shared setup. In
the `soccotash2` checkout, always use the `npm run docker:isolated:*` commands
below to target Agent 2.

### Start Agent 2 for the first time

```bash
cp .env.agent2.example .env.agent2
# Replace the example password and set OLRIGBANK_HTTPS_HOST if required.
npm run docker:isolated:up
```

Open `http://localhost:8082/` or `https://<LAN-address>:8444/`. The isolated
PostgreSQL service is exposed only on loopback at port `5434`.

### Operate Agent 2

```bash
npm run docker:isolated:logs
npm run docker:isolated:sync
npm run docker:isolated:report
npm run docker:isolated:backup
npm run docker:isolated:restore -- backups/olrigbank-YYYYMMDD-HHMMSS.dump
npm run docker:isolated:down
```

Stopping Agent 2 does not stop the primary instance. Its database data remains
in the `olrigbank2_isolated-postgres-data` volume unless that volume is
explicitly removed.

Booking regression tests can target it with
`BOOKING_REGRESSION_BASE_URL=http://127.0.0.1:8082`; fixture setup must use the
isolated database URL on port `5434`.

See `docs/booking-calendar-service.md` and `docs/deployment-guide.md` for the complete workflow.
See `docs/olrigbank-migration.md` for the side-by-side migration and independent
Render Blueprint procedure.
See [`docs/airbnb-private-import-operations.md`](docs/airbnb-private-import-operations.md)
for the private Agent 2 Airbnb import, verification and recovery procedure.

## Source structure

```text
compose.yaml                         Primary/shared local application definition
compose.isolated.yaml                Isolated Agent 2 database and Compose overrides
site/                               Astro/Node application
site/db/                            Ordered PostgreSQL migrations
site/src/content/local-guide/       Local guide entries
site/src/content/listings/          Property/listing pages
site/src/content/pages/             General pages
site/src/data/booking/              Booking property configuration
site/public/media/images/           Images referenced by content
.pages.yml                          Pages CMS configuration
render.yaml                         Render Blueprint
```

## Native checks

Docker is the standard runtime, but source checks can still be run directly:

```bash
npm --prefix site ci
npm --prefix site run check
npm --prefix site run build
```

## Administration

The protected administration foundation is available at `/admin/`. After the database migration has run, create the first administrator using the instructions in [`docs/admin-foundation.md`](docs/admin-foundation.md). The pricing implementation is described in [`docs/pricing-foundation.md`](docs/pricing-foundation.md).
Secure customer offer links and acceptance/decline handling are described in [`docs/customer-booking-offer-access.md`](docs/customer-booking-offer-access.md).
The conversation-first Booker and administrator workflow is described in [`docs/booking-messaging.md`](docs/booking-messaging.md).
Privacy-safe Umami navigation and booking-funnel tracking is described in [`docs/analytics.md`](docs/analytics.md).


## Reusable pricing rule cards

Pricing administrators can define and manage reusable custom rule cards at `/admin/pricing/rule-cards/`. Active cards are available in the main `/admin/pricing/` rule library.
