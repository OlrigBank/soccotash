# Search Console indexing policy and verification

## Status and purpose

Implemented locally on `feature/search-console-indexing-and-verification`, based
on `development` at `174312b`. Production deployment, merging and Search Console
account actions remain pending. No database migration is required.

The Local Guide is guest reference material. Its overview remains a search
landing page; its categories and individual recommendations do not need separate
search results. Success is correct indexing eligibility for the intended pages,
not indexing every URL or reducing every exclusion count to zero.

## Implemented behaviour

- `/local-guide/` retains its canonical, indexable metadata and sitemap entry.
- Successful `/local-guide/[slug]/` category and entry pages return
  `noindex,follow`. The existing layout suppresses canonical and social
  metadata on these excluded pages. Guest content and links remain available.
- Missing and unavailable guide pages retain their error statuses and
  `noindex,nofollow`; slug aliases retain permanent redirects.
- The sitemap omits every guide child page, including future entries. It no
  longer queries guide categories or entries. Published public holiday plans
  and the other public pages retain their existing inclusion policy.
- `robots.txt` still permits guide crawling so search engines can read `noindex`.
- The release verifier checks all four current listings, booking entry, guide
  overview, sampled guide references and every permitted sitemap destination.
  It fails for redirects on indexable destinations, non-200 responses, incorrect
  canonicals, indexing prohibitions, unexpected content types, excluded sitemap
  URLs, crawl blocks, unavailable requests and an incorrect retired-listing
  redirect. Requests are read-only, time limited and do not follow redirects.
- `sitemapPaths` no longer accepts guide category or entry inventory fields.
  The verifier command and `--base-url` interface remain unchanged.

UI pattern: **Local guide folder gallery** — existing custom UI built with native
`details` and `summary` disclosure controls. No new UI pattern or style change.

## Source evidence, 18 October 2026

The supplied coverage export has chart data through 12 October: 41 indexed and
38 excluded URLs, compared with 20 indexed and 50 excluded on 28 August.
The drilldown identifies all 25 discovered, currently unindexed URLs as guide
references: nine categories and 16 entries. Its `1970-01-01` crawl dates are
apparent missing-date placeholders, not meaningful crawl history.

All paths below are relative to `https://olrig-bank.com/local-guide/`:

| Categories | Entries |
|---|---|
| `activities/` | `abbothall/` |
| `bars/` | `albion-snooker-hall/` |
| `cycling/` | `baycycleway/` |
| `eating-out/` | `cyclesprog/` |
| `festivals/` | `fellfoot/` |
| `local/` | `gurnal-dubs-tarn/` |
| `outdoor-pursuits/` | `ingenlboroughcave/` |
| `pre-owned/` | `joshua-tree/` |
| `whats-on/` | `kendal-jazz/` |
| — | `kendalfishandseafoods/` |
| — | `mountain/` |
| — | `qtm/` |
| — | `ring-o-bells/` |
| — | `ruskins/` |
| — | `staff-of-life/` |
| — | `tradclimbing/` |

This evidence supersedes the earlier suggestion to expand these pages for
indexing. Raw exports and account credentials are not included in this feature.

## Verification, 18 October 2026

Local verification used the rebuilt production bundle at `127.0.0.1:8097`, served
by the existing public review preview with a disposable migrated database schema.
No real customer credentials, booking submission or notification was used.

- `npm run check`: zero errors and warnings; three existing hints in unrelated
  administration files.
- `npm run build`: passed.
- Booking-lifecycle suite: all 94 test files passed.
- Expanded local release verifier: passed all 13 sitemap destinations, sampled
  guide category and entry, discovery rules and retired-listing redirect.
- Playwright: all 24 focused tests passed at 320 × 800, 390 × 844, 768 × 1024
  and 1440 × 900. Coverage includes indexing policy, missing references, native
  folder operation, new-tab continuation, JavaScript-free links, progressive
  scrolling and keyboard continuation, focus and document overflow.
- Chrome DevTools: inspected rebuilt guide overview, Activities and Abbot Hall
  at representative 390 × 844, 768 × 1024 and 1440 × 900 widths. Checked native
  keyboard expansion and solid visible focus, accessible headings and main
  landmarks, metadata, guest links, image loading and overflow. No unexpected
  document overflow, image failures or console warnings/errors were observed.
  Network inspection confirmed local guide document responses were successful.
- Lighthouse mobile audits: overview accessibility 96, best practices 100,
  SEO 100; category and entry accessibility 96, best practices 100, SEO 66;
  principal listing accessibility, best practices and SEO all 100.
  Child-page SEO failures are expected because of deliberate `noindex`.
- Investigated remaining Lighthouse findings: the guide footer paragraph has
  existing contrast of 2.4:1; the overview also recorded layout shift of 0.13.
  The footer, layout and styles are unchanged by this feature. Record these as
  separate accessibility/layout follow-ups rather than changing styling here.
  Reports were generated under `/tmp/soccotash-search-audits/`; these temporary
  files are supporting evidence, not committed deliverables.

Read-only production verification on the same date succeeded for the required
indexable public pages, remaining permitted sitemap destinations and retired
listing redirect. Production still has the old guide policy: the two sampled
child pages lack `noindex` and advertise canonicals, and 62 of the 75 sitemap URLs
are guide children. These expected pre-deployment failures must be rechecked
after an approved deployment; they are not local implementation failures.

Domain HEAD checks: HTTP apex redirects to HTTPS apex; HTTPS `www` redirects to
HTTPS apex; HTTP `www` redirects via HTTPS `www` (two hops to the preferred apex).
Both protocols for `olrigbank.co.uk` and `www.olrigbank.co.uk` failed DNS resolution
(`ENOTFOUND`) from this environment. No DNS or hosting settings were changed.
Confirm whether those older domains are owned and intended to be active before
planning a domain-specific fix.

## Remaining Search Console investigations

Account sign-in was rejected in the automated browser. Complete these checks in
an authorised normal browser, or provide sanitised issue/performance exports.
Do not infer Google-selected canonicals from the HTML canonical alone.

| Issue | URLs | Evidence still required | Disposition |
|---|---:|---|---|
| Duplicate without user-selected canonical | 5 | Affected URL list and URL Inspection canonical details | Pending evidence |
| Google selected a different canonical | 2 | Affected URL list, declared and selected canonical | Pending evidence |
| Page with redirect | 3 | Affected URLs, redirect chain and destination indexability | Pending evidence |
| Alternate with proper canonical | 2 | Affected URLs and intended canonical destination | Pending evidence |
| Blocked by robots.txt | 1 | Affected URL and intended indexability | Pending evidence |

For each affected URL record: date, URL, intended indexability, response status,
redirect destination if present, HTML canonical, Google-selected canonical,
relevant robots rule, proposed disposition and validation outcome. Expected
alternates, private blocks and redirects need no repair. Any newly proven defect
gets a separately scoped fix, not a speculative bulk redirect or content rewrite.

Post-deployment checklist:

- Run the release verifier against production and record the deployed commit.
- Check sitemap acceptance and absence of guide child URLs.
- Inspect homepage, listings index, all four accommodation listings, booking
  entry and guide overview for intended canonical and indexing eligibility.
- Inspect one guide category and entry: successful delivery, readable `noindex`,
  and no crawl block. Existing indexed guide references may disappear gradually.
- Review available Core Web Vitals, HTTPS and enhancement reports. Distinguish
  missing/insufficient data from a passing result. Validate structured data with
  Google's Rich Results Test where applicable; local JSON-LD checks do not
  establish rich-result eligibility.
- Capture Search results data for equivalent complete 28-day periods: clicks,
  impressions, CTR, average position, queries, landing pages and devices.
  Distinguish branded searches from accommodation-intent queries. Small samples
  are descriptive, not proof of a lasting trend.
- Review weekly for four weeks, then monthly. Do not create an automation or
  change listing copy without separate evidence and scope.

## References

- [Google: blocking indexing with noindex](https://developers.google.com/search/docs/crawling-indexing/block-indexing)
- [Google: page indexing report](https://support.google.com/webmasters/answer/7440203)
- [Release runbook](../seo-release-runbook.md)
- [Measurement baseline](../seo-measurement-baseline.md)
