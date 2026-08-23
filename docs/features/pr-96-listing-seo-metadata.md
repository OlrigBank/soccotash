# Proposed PR #96 — Listing SEO Metadata Foundation

## Status

- Parent branch: `agent/getting-olrig-bank-to-go-viral-epic`
- Feature branch: `agent/pr-96-listing-seo-metadata`
- Intended merge target: `agent/getting-olrig-bank-to-go-viral-epic`
- Database changes: none expected

## Objective

Allow a public listing to retain its public accommodation name while supplying a
unique search title, meta description and descriptive page heading.

## Implementation

1. Extend the listing content schema with optional, bounded fields such as
   `seoTitle`, `description`, `heroEyebrow` and `heroTitle`.
2. Keep `title` authoritative for cards, navigation and accommodation identity.
3. Update the listing route to pass the SEO title and description to
   `BaseLayout` while rendering the listing identity and hero heading
   separately.
4. Add the initial Olrig Bank values:

   ```text
   seoTitle: Olrig Bank — Large Group and Family Holiday House in Kendal
   description: Spacious self-catering holiday accommodation for 8–10 guests in Kendal, with four bedrooms, two bathrooms, a large garden and off-road parking near the Lake District.
   heroEyebrow: Olrig Bank
   heroTitle: Large group and family holiday house in Kendal
   ```

5. Preserve sensible fallbacks for all other listings.
6. Keep metadata server-rendered; do not construct it only in client JavaScript.

## Acceptance criteria

1. The stable `/listings/main-house/` Olrig Bank URL has a unique descriptive document title and meta
   description in its initial HTML.
2. Listing cards display `Olrig Bank`, not the full SEO title.
3. The visible heading is useful and not duplicated into multiple `h1` elements.
4. Missing optional fields fall back to current behaviour.
5. Schema and rendering tests cover supplied and fallback metadata.
6. Astro content validation and the existing site check pass.

## Out of scope

- Olrig Bank long-form copy and FAQ.
- Canonical, social or structured metadata.
- Sitemap and crawler submission.
