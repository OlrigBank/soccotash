# Public search measurement baseline

This is the repeatable, non-private evidence record for the public search epic.
Do not add credentials, account identifiers, guest data or raw private exports.

## Release record

| Field | Value |
|---|---|
| Deployment date and time | Pending production deployment |
| Git commit | Pending |
| Production verifier | Pending |
| Mobile visual check | Pending |
| Old listing redirect | Pending |
| Recorded by | Pending |

## Pre-release technical baseline

Checked on **23 August 2026** with `npm --prefix site run
verify:public-release`, before deploying the epic:

- the live site still serves the earlier listing paths and
  `/listings/olrig-bank/` returns HTTP 404;
- production pages do not yet contain the epic's canonical and Open Graph
  metadata or vacation-rental JSON-LD; and
- production `/sitemap.xml` and `/robots.txt` return HTTP 404.

The same verifier passes every check against the completed local Docker build,
including 70 unique sitemap URLs. These live failures are the expected
pre-deployment state. Replace them with a dated passing production result only
after the epic has been deployed; do not submit the sitemap in Search Console
before it exists at the production URL.

## Search Console submission

| Check | Status | Date | Non-private note |
|---|---|---|---|
| `olrig-bank.com` property verified | Pending | — | — |
| `/sitemap.xml` submitted | Pending | — | — |
| Sitemap accepted | Pending | — | — |
| Home URL inspected | Pending | — | — |
| Listings index inspected | Pending | — | — |
| Olrig Bank listing inspected | Pending | — | — |
| Cottage listing inspected | Pending | — | — |

For inspected pages, note whether Google reports the intended canonical and
whether indexing was requested. Record actionable errors verbatim only when
they contain no private account information.

## Search performance observation

Use one row per comparable observation period. Search Console figures can be
delayed, so record the data end date as well as the date reviewed.

| Reviewed | Period | Data through | Clicks | Impressions | CTR | Average position | Leading queries and landing pages |
|---|---|---|---:|---:|---:|---:|---|
| Pending | Initial 28 days | — | — | — | — | — | — |

## Privacy-safe booking funnel

| Period | Listing views | Availability started | Available results | Booking requests | Notes |
|---|---:|---:|---:|---:|---|
| Pending | — | — | — | — | — |

Use aggregate Umami event counts only. A useful diagnostic ratio is availability
starts divided by listing views; a stronger intent ratio is booking requests
divided by availability starts. Small samples must be reported as small samples,
not treated as statistically reliable trends.

## Decisions and follow-up features

| Date | Evidence | Decision | Feature document |
|---|---|---|---|
| — | Awaiting observation period | No copy change yet | — |
