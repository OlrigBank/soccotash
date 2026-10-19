# Public search measurement baseline

This is the repeatable, non-private evidence record for the public search epic.
Do not add credentials, account identifiers, guest data or raw private exports.

## Release record

| Field | Value |
|---|---|
| Deployment date and time | Current feature deployment pending; earlier production release date not recorded |
| Git commit | Feature based on `174312b`; deployed commit unverified |
| Production verifier | 18 October: public pages pass; new guide policy awaits deployment |
| Mobile visual check | Rebuilt disposable preview checked on 18 October; production visual check pending |
| Old listing redirect | Verified locally and live on 18 October |
| Recorded by | Codex, 18 October 2026 |

## Historical pre-release technical baseline (23 August 2026)

Checked on **23 August 2026** with `npm --prefix site run
verify:public-release`, before deploying the epic:

- the live site still serves the earlier listing paths and
  `/listings/olrig-bank/` returns HTTP 404;
- production pages do not yet contain the epic's canonical and Open Graph
  metadata or vacation-rental JSON-LD; and
- production `/sitemap.xml` and `/robots.txt` return HTTP 404.

The same verifier passes every check against the completed local Docker build,
including 70 unique sitemap URLs. These were the expected pre-deployment failures
on that date. Preserve this historical result; the dated October checks below
supersede it.

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
| Event listing inspected | Pending | — | — |
| Bespoke listing inspected | Pending | — | — |
| Booking entry inspected | Pending | — | — |
| Guide overview inspected | Pending | — | — |
| Excluded guide samples inspected | Pending | — | After deployment |

For inspected pages, note whether Google reports the intended canonical and
whether indexing was requested. Record actionable errors verbatim only when
they contain no private account information.

## Search performance observation

Use one row per comparable observation period. Search Console figures can be
delayed, so record the data end date as well as the date reviewed.

| Reviewed | Period | Data through | Clicks | Impressions | CTR | Average position | Leading queries and landing pages | Devices |
|---|---|---|---:|---:|---:|---:|---|---|
| Pending | Initial 28 days | — | — | — | — | — | — | — |

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
| 18 October 2026 | Coverage and guide drilldown | Exclude guide children; retain overview; no listing copy changes | [Indexing policy and verification](features/search-console-indexing-and-verification.md) |

## Current verification baseline, 18 October 2026

Local checks for `feature/search-console-indexing-and-verification` pass against
the rebuilt production bundle and disposable database: all 13 sitemap URLs,
indexable public metadata, excluded guide samples and retired-listing redirect.
The feature has not been deployed.

Read-only live verification confirms that the required public landing pages
and listing metadata now pass; production sitemap and robots endpoints exist.
The live sitemap contains 75 URLs, including 62 guide child pages. Both sampled
child pages remain indexable. These are expected failures against the new policy
until this feature is deployed. Production commit and deployment date remain
unverified. HTTP/HTTPS and domain findings are recorded in the feature record.

The supplied Search Console exports cover data through **12 October 2026**:

| Measure | Value |
|---|---:|
| Indexed URLs | 41 |
| Excluded URLs | 38 |
| Discovered, currently unindexed guide references | 25 |
| Impressions, 22 August–12 October | 139 |
| Impressions, 6–12 October | 30 |
| Impressions, 29 September–5 October | 14 |

These are export-derived facts, not a verified current account status. The
metadata says “All known pages”; it does not prove sitemap submission or
acceptance. Clicks, CTR, query data and average position were not supplied.
Search Console account checks in the table above remain pending.

For the next performance comparison record: reviewed date, exact start/end dates,
data-through date, clicks, impressions, CTR, average position, queries, pages and
devices. Compare equivalent complete 28-day periods and separate branded from
accommodation-intent searches where the data permits. No scheduled automation is
configured. Intentional guide exclusions may reduce the indexed-page total.

See [the feature record](features/search-console-indexing-and-verification.md)
for the complete policy, verification evidence and remaining issue checklist.
