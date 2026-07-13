# Soccotash / Olrig Bank Astro site

This repository contains the migrated Olrig Bank guest website content and a minimal Astro application that renders it as a static website.

## Structure

```text
site/
  src/content/local-guide/     Migrated guide entries
  src/content/listings/        Property/listing pages
  src/content/pages/           General pages such as home/contact
  src/data/navigation/main.yml Migrated navigation tree
  public/media/images/         Images used by Markdown content
.pages.yml                     Pages CMS editing configuration
render.yaml                    Render deployment blueprint for the Astro site
```

## Run locally

From the repository root:

```bash
npm install --prefix site
npm run dev
```

For mobile testing on the same network:

```bash
npm --prefix site run dev -- --host 0.0.0.0 --port 4322
```

## Build and check

```bash
npm --prefix site ci
npm --prefix site run check
npm --prefix site run build
```

The static site is built to `site/dist/`.

## Content editing

Pages CMS uses `.pages.yml` at the repository root. It is configured to edit:

- Local guide Markdown entries
- General Markdown pages
- Listing Markdown pages
- Site/contact YAML settings
- Navigation YAML
- Images in `site/public/media/images/`

## Deployment

The included `render.yaml` deploys only the Astro site under `site/` as a Docker web service. It does not deploy a self-hosted Pages CMS application; Pages CMS can be used as a Git-based editing layer via its GitHub integration.


## Booking calendar service

The Astro server now includes Airbnb iCal import, PostgreSQL availability storage and a provisional booking request page at `/book/`. See `docs/booking-calendar-service.md`.
