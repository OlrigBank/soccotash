# Public search release runbook

Use this runbook after deploying public search changes to `https://olrig-bank.com`.
It records evidence without placing Google credentials, private exports or guest
data in the repository.

## 1. Automated production checks

From the repository root run:

```bash
npm --prefix site run verify:public-release
```

The command checks the home, listing index, three public listings and contact
page for successful responses, titles, descriptions, production canonicals and
Open Graph metadata. It also validates listing JSON-LD and the required sitemap
and robots inventory.

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
   - `https://olrig-bank.com/listings/cottage/`.
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
