# Soccotash / Olrig Bank website

Soccotash is an Astro/Node website with PostgreSQL-backed availability, a visible two-month booking calendar, and provisional booking requests. Content is maintained as Markdown/YAML through Pages CMS or direct Git editing.

## Runtime architecture

### Local development and testing

Docker Compose runs:

- `site`: Astro/Node application
- `database`: PostgreSQL 17 with a persistent Docker volume
- optional one-shot tools for calendar synchronisation and booking reports

### Render

Render runs the same `site/Dockerfile` as a Docker web service and supplies a separate managed Render PostgreSQL database through `DATABASE_URL`.

## First local start

```bash
cp .env.example .env
```

Edit `.env`, adding strong local values and the Airbnb iCal export URLs. Then run:

```bash
docker compose up --build -d
```

Open:

```text
http://localhost:8080/
http://localhost:8080/book/
```

Database migrations run automatically whenever the application container starts.

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

See `docs/booking-calendar-service.md` and `docs/deployment-guide.md` for the complete workflow.

## Source structure

```text
compose.yaml                         Local application and PostgreSQL stack
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
