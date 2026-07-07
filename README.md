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

Or from inside `site/`:

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

The static site is built to `site/dist/`.

## Content editing

The local-guide content is in Markdown with YAML frontmatter. Pages CMS can use `.pages.yml` at the repository root to edit the Markdown, YAML navigation and settings files.

## Deployment

The included `render.yaml` deploys only the Astro site under `site/`. It does not deploy a self-hosted Pages CMS application; Pages CMS can be used as a Git-based editing layer via its GitHub integration.
