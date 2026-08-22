# Proposed PR #99 — Canonical and Social-Sharing Metadata

## Status

- Parent branch: `agent/getting-olrig-bank-to-go-viral-epic`
- Feature branch: `agent/pr-99-canonical-social-metadata`
- Intended merge target: `agent/getting-olrig-bank-to-go-viral-epic`
- Depends on: PR #96
- Database changes: none expected

## Objective

Give every indexable public page one stable production canonical URL and produce
accurate, attractive metadata when listing pages are shared.

## Implementation

1. Extend `BaseLayout` to derive a production HTTPS canonical URL from the
   configured Astro site and normalized request path.
2. Emit one `<link rel="canonical">` for indexable public pages.
3. Add page-specific Open Graph title, description, URL, type and image fields.
4. Add compatible social-card metadata where useful.
5. Resolve image paths to absolute production URLs.
6. Make private/noindex layouts retain their current protections and avoid
   advertising private URLs through social metadata.
7. Prevent proxy host headers or query strings from changing the production
   canonical.

## Acceptance criteria

1. The Main House canonical is exactly
   `https://olrigbank.co.uk/listings/main-house/`.
2. Query parameters do not create alternate canonicals.
3. Social metadata agrees with visible title, description and image.
4. Canonical and social URLs are absolute HTTPS URLs.
5. Local Docker hostnames never appear in production metadata tests.
6. Metadata serialization escapes untrusted content safely.

## Out of scope

- Sitemap generation.
- Vacation-rental JSON-LD.
- Social-network posting or automation.
