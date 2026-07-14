# Deployment guide

## Local production-like deployment

Soccotash is run locally as a complete Docker Compose stack.

```bash
cp .env.example .env
docker compose up --build -d
```

Services:

```text
database   PostgreSQL 17 with persistent volume
site       Astro standalone Node server built from site/Dockerfile
```

Open `http://localhost:8080/`.

Useful commands:

```bash
docker compose ps
docker compose logs -f site
docker compose restart site
docker compose down
```

Rebuild after source changes:

```bash
docker compose up --build -d
```

## Move the database to another development machine

Create a portable PostgreSQL custom-format backup:

```bash
./backup-db.bash
```

Copy the resulting file from `backups/` together with the repository to the new machine. Start the new stack, then restore it:

```bash
docker compose up --build -d
./restore-db.bash backups/soccotash-YYYYMMDD-HHMMSS.dump
```

The scripts use `pg_dump` and `pg_restore` inside the PostgreSQL container, so PostgreSQL tools do not need to be installed on Mint.

## Render architecture

`render.yaml` defines:

- a Docker web service built from `site/Dockerfile`;
- a separate managed Render PostgreSQL database;
- `DATABASE_URL` injected from that database;
- secret placeholders for Airbnb calendars and the admin token;
- `/api/health/` as a database-aware health check.

The container entrypoint waits for PostgreSQL and applies migrations before starting Astro. This replaces the previous `preDeployCommand`, which is unavailable on the free Render web-service plan.

## First Render deployment

1. Push the updated repository to GitHub.
2. Apply or update the Render Blueprint.
3. Enter the requested secret values:
   - `AIRBNB_MAIN_HOUSE_ICAL_URLS`
   - `AIRBNB_COTTAGE_ICAL_URLS`
   - `CALENDAR_SYNC_TOKEN`
4. Deploy the service.
5. Confirm `/api/health/` returns HTTP 200.
6. Force a calendar sync using the authenticated endpoint.
7. Open `/book/` and submit a test provisional request.
8. Retrieve `/api/admin/booking-report/` with the token and confirm the request is present.

## Updating Render

Normal pushes to the connected branch trigger a new Docker build and deployment. Database data remains in the separate Render PostgreSQL service.

Each new container start runs only unapplied migrations. Existing migration files are checksum protected and must not be edited after deployment.

## Important free-plan limitation

The free Render PostgreSQL database expires after its free period and has no production backup guarantees. It is suitable for this testing phase only. Move to a persistent paid database before accepting real guest records as the sole system of record.
