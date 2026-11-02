# Gatepost plaque introduction

Implemented on `feature/plaque-landing`, branched from `development`, 2 November 2026.

## Experience

The permanent QR destination `/plaque/` is a server-rendered public page in the
existing BaseLayout, with its shared header, footer, sidebar and floating booking
form disabled for this page. The skip link, metadata and analytics are retained. It is included
in the sitemap and remains useful without JavaScript.

Revised at the owner's request to follow the supplied Claude example more closely:
no photograph, a green-and-gold title badge, a prominent live rating strip, the
original house introduction, four guest highlights and three short endorsements.
The retained **Read more guest reviews** link leads to `/#guest-reviews`.

The rating and review count are calculated from the source database's currently
published review records on every request using `getPublishedReviews()`, exactly
as on the homepage. Neither 4.97 nor 59 is fixed in the page. The strip reads
**[rating] out of 5 from [count] Airbnb guest reviews**. Publishing or unpublishing
reviews changes both figures without a rebuild. Failed or empty review retrieval
omits the strip and quotations rather than showing a stale fixed score.

Claude's Andrew, Howard and Monica excerpts are shown only when their exact text
matches a currently approved public review; attribution and stay month/year come
from that record. The supplied Location, Space, Character and garden, and Your host
summaries are retained.

A compact accommodation table follows Claude's order: Cottage, Olrig Bank and
Olrig Bank++. Names and capacities come from the existing listing collection;
nightly prices come from the existing published pricing service. Missing prices
say **Ask for price**. Prices are labelled as base nightly prices, with an invitation
to check dates. No copied fixed prices or unconditional cheaper-booking claim.

The table links to the individual listings; closing actions lead to `/book/`,
`/` for photos and `/local-guide/`. The plaque has no shared header or footer; other public pages retain both by
default. Its own title badge and closing navigation provide the introduction and
onward links. This is the **Standalone plaque page** custom layout pattern.

UI pattern names:

- **Plaque introduction** — custom green-and-gold title badge and short introduction.
- **Live guest rating strip** — custom score panel immediately below the introduction.
- **Guest highlights** — custom four-item summary list.
- **Guest endorsement strip** — custom short quotations from approved public reviews.
- **Stay comparison table** — native HTML table with custom styling and native links.
- Navigation uses native HTML anchors.

## Tracking

See [Visitor analytics](../analytics.md) for payload privacy, tab-scoped plaque
attribution, bounded pending queue, event names and dashboard/release instructions.
Both pageviews and custom events now sanitise private paths, titles and referrers.
Automatic tracker collection stays disabled in favour of explicit manual payloads.
Existing booking events inherit plaque attribution; the tracker never blocks links.

## Verification

- Production build and Astro check pass (zero errors and warnings; three existing hints).
- 32 plaque Playwright checks pass, covering 320×800, 390×844, 768×1024 and 1440×900: main-content keyboard
  access, absence of a content image and shared header/footer, default header/footer on onward
  pages, database-derived rating/count, document overflow, onward attribution, safe nested private routes and
  referrers, delayed readiness, repeated readiness, reloads, fast onward navigation,
  expired attribution, blocked storage/tracker, unavailable reviews, disabled analytics,
  every content destination and navigation without JavaScript.
- Existing sitemap and welcome test files pass; sitemap coverage includes `/plaque/`.
  A further 24 existing welcome and search-indexing Playwright checks pass.
- Chrome DevTools inspected the rebuilt disposable preview at 320×800, 390×844,
  768×1024 and 1440×900. No document or visible local content overflow (the
  screen-reader-only table caption is intentionally clipped); skip-link focus is
  visible with a 3px outline; link names and heading hierarchy checked. The document and
  analytics bootstrap return 200; no shared logo or house image is requested. No console errors or
  warnings with analytics disabled for the quality audit.
- Lighthouse mobile and desktop: accessibility, best practices, SEO and agentic
  browsing all 100, no failing audits. Initial contrast failures were corrected:
  the revised title badge and score meet contrast requirements, and shared footer
  supporting copy has an explicit accessible colour. The DevTools audit excludes performance.
  Revised-page reports are in `/tmp/plaque-standalone-lighthouse-mobile/` and
  `/tmp/plaque-standalone-lighthouse-desktop/` for this session.

## Limits and release

No merge, deployment, production setting change or dashboard provisioning was
performed. Analytics regression tests use a mocked tracker API and disposable local
fixtures, not the live collector. Actual production tracker delivery and Umami
reporting must be confirmed after the owner approves a deployment. The stable
DevTools preview deliberately has analytics disabled to avoid sending test visits.
Browser blocking and network failure can prevent delivery; visits cannot prove
physical QR scans or attribute a later visit from another tab/device.
