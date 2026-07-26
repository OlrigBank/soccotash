# Olrig Bank Web migration

The `MigrationToOlrigBankWeb` branch renames the application and deployment
infrastructure while deliberately preserving booking behaviour, database
tables, migrations, API routes, customer tokens and the GitHub repository name.

## Local side-by-side comparison

The existing Soccotash stack owns PostgreSQL and its persistent volume. Start it
first from the original checkout:

```bash
docker compose -p soccotash up --build -d
```

Copy `.env.example` to `.env` in this checkout and use the same
`POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` and application secrets.
Then start Olrig Bank Web:

```bash
docker compose up --build -d
```

The two sites are available at:

- Soccotash: `http://localhost:8080`
- Olrig Bank Web: `http://localhost:8081`

Olrig Bank Web joins the external network named by
`SOCCOTASH_DOCKER_NETWORK` (default `soccotash_default`) and connects to the
existing service hostname `database`. It does not create another PostgreSQL
container or volume.

Because both applications share one database, do not edit the same booking or
run calendar synchronisation from both applications simultaneously.

## Render Blueprint

`render.yaml` creates independent Render resources:

- `olrigbank-web` — Docker web service
- `olrigbank-bookings` — managed PostgreSQL database

The Blueprint derives `BOOKING_SERVICE_URL` and `BOOKING_PUBLIC_URL` from the
new Render service. Automatic deployment is disabled during comparison.
Secrets remain interactive `sync: false` values.

Creating this Blueprint does not modify the current Soccotash Render service or
database.
