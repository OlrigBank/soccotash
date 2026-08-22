# Proposed PR #100 — XML Sitemap and Robots Discovery

## Status

- Parent branch: `agent/getting-olrig-bank-to-go-viral-epic`
- Feature branch: `agent/pr-100-sitemap-robots`
- Intended merge target: `agent/getting-olrig-bank-to-go-viral-epic`
- Depends on: PR #99
- Database changes: none expected

## Objective

Provide search crawlers with an explicit inventory of canonical public pages and
clear instructions that do not expose private operational routes.

## Implementation

1. Add the supported Astro sitemap integration or a small deterministic sitemap
   endpoint suitable for the server output mode.
2. Include canonical public pages, listing pages, public Local Guide entries and
   intentionally public example holiday plans.
3. Exclude administration, authentication, API, tokenized booking, planner
   invitation and private share URLs.
4. Add `/robots.txt` with the production sitemap URL and conservative crawler
   rules.
5. Ensure dynamic database-backed public URLs are included through a safe build
   or request-time source appropriate to the deployment architecture.
6. Avoid using `robots.txt` as the only privacy protection; authentication and
   `noindex` behaviour remain authoritative.

## Acceptance criteria

1. The sitemap is valid XML and uses absolute canonical HTTPS URLs.
2. Main House and Cottage listing URLs are present once each.
3. No secret token, private booking, administration or API URL is present.
4. `robots.txt` is plain text, available at the site root and references the
   production sitemap.
5. Sitemap and robots responses have suitable content types and successful
   status codes.
6. Automated allow/exclude tests cover representative public and private paths.

## Out of scope

- Search Console access or submission.
- Ranking guarantees.
- News, image or video-specific sitemaps.
