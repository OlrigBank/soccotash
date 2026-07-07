# Content model

## Local guide

Path: `site/src/content/local-guide/*.md`

Each entry has YAML frontmatter with:

- `title`
- `slug`
- `legacyId`
- `category`
- `categoryLabel`
- `image`
- `externalLink`
- `recommended`
- `summary`
- `legacyText`

The body is rendered as the main page content.

## Pages

Path: `site/src/content/pages/*.md`

Used for top-level pages such as `/contact/` and `/guest-information/`. The file `home.md` is used for `/`.

## Listings

Path: `site/src/content/listings/*.md`

Used for `/listings/` and individual listing detail pages.

## Navigation

Path: `site/src/data/navigation/main.yml`

This file contains the migrated menu tree and local guide categories. Astro reads this at build time.
