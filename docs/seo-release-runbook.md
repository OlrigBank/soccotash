# Public search release runbook

Use this runbook after deploying public search changes to `https://olrig-bank.com`.
It records evidence without placing Google credentials, private exports or guest
data in the repository.

## 1. Automated production checks

From the repository root run:

```bash
npm --prefix site run verify:public-release
```

The command checks the home, listing index, all four current listings, contact,
booking entry and guide overview for HTTP 200 without redirects, titles,
descriptions, preferred canonicals, Open Graph metadata and absence of indexing
prohibitions. It retains the existing listing JSON-LD checks. These are technical
checks, not a Google rich-result eligibility guarantee.

It also checks the Activities category and Abbot Hall entry for `noindex` and
continued link following, every permitted sitemap destination, sitemap exclusion
rules, crawler access and the permanent retired Main House redirect. The guide
overview belongs in the sitemap; guide children do not. Keep guide crawling
permitted so search engines can read `noindex`.

The verifier makes read-only requests with redirects disabled and 15-second
request timeouts. Failures, including unavailable requests, produce a non-zero
exit status. `--base-url` accepts an HTTP(S) origin without credentials; canonical
expectations always use the production domain. The target must have the two
published guide samples available. Invalid sitemap origins are reported and are
never fetched.

To exercise the deployed Docker build while retaining production canonical
expectations:

```bash
npm --prefix site run verify:public-release -- --base-url http://127.0.0.1:8080
```

Record the date, commit, deployment and result in
`docs/seo-measurement-baseline.md`. Resolve failures before Search Console
submission.

## 2. Manual production checks

- Open each checked page in a normal and mobile viewport.
- Confirm visible names, occupancy and room counts agree with JSON-LD.
- Confirm `/listings/main-house/` redirects to `/listings/olrig-bank/`.
- Confirm no private booking, admin or unpublished planner URL appears in the
  sitemap.
- Test the listing availability and contact calls to action without submitting
  a test booking in production.

## 3. Google Search Console

Sign in directly to Google Search Console with an authorised Olrig Bank account.
Never copy authentication tokens, credentials or private exports into this
repository.

1. Select or verify the domain property for `olrig-bank.com`. A URL-prefix
   property should use `https://olrig-bank.com/` exactly.
2. Submit `https://olrig-bank.com/sitemap.xml` in **Sitemaps**.
3. Record whether it is accepted, the submission date and any actionable error.
4. Use **URL inspection** for:
   - `https://olrig-bank.com/`;
   - `https://olrig-bank.com/listings/`;
   - `https://olrig-bank.com/listings/olrig-bank/`; and
   - `https://olrig-bank.com/listings/cottage/`;
   - `https://olrig-bank.com/listings/event/`;
   - `https://olrig-bank.com/listings/bespoke/`;
   - `https://olrig-bank.com/book/`; and
   - `https://olrig-bank.com/local-guide/`.
5. Check the declared and selected canonical. Request indexing where available.
6. Record statuses in the baseline, using summaries rather than screenshots or
   exports containing account information.

Submission and an indexing request do not guarantee indexing or ranking.

## 4. Measurement cadence

Capture an initial baseline after release, then review weekly for the first four
weeks and monthly thereafter. Compare equivalent date ranges where possible and
allow at least 28 days before making large copy changes unless a factual or
technical defect needs immediate correction.

Record Search Console clicks, impressions, click-through rate, average position,
leading non-identifying queries and landing pages. Record Umami counts for
`listing_viewed`, `availability_started`, `availability_result` and
`booking_requested`. Do not record guest names, contact details, dates, booking
references, tokens, prices or message content.

Treat query and conversion findings as evidence for separately scoped feature
documents. Do not silently expand this epic or promise traffic outcomes.

## 5. Canonical, domain and exclusion investigation

Export each remaining issue's affected URL list from its detail page. For each
URL record intended indexability, response status, redirect chain, declared and
Google-selected canonical, crawl rule and disposition. Leave deliberate
redirects, alternates and private exclusions in place. Avoid guessed fixes.

Use read-only requests to check HTTP/HTTPS and `www` variants for consistent
redirects to `https://olrig-bank.com/`. Verify older domains only after confirming
they are still intended to operate; do not change DNS or hosting as part of a
verification run. Include path preservation in any later domain-specific fix.

Inspect a guide category and individual entry after deployment. Both should
serve normally with `noindex,follow`; neither should be blocked by robots.txt.
Search Console may retain old statuses until Google revisits the URLs.

Review available Core Web Vitals, HTTPS and enhancement reports. Record missing
data explicitly. Use Rich Results Test where applicable for structured data;
local JSON-LD validation alone cannot establish rich-result eligibility.

The [October feature record](features/search-console-indexing-and-verification.md)
contains the issue counts, agreed indexing policy and verified local/live results.
