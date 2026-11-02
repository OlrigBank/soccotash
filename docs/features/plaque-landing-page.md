# Gatepost plaque introduction

Implemented on `feature/plaque-landing`, branched from `development`, 2 November 2026.

## Experience

The permanent QR destination `/plaque/` is a server-rendered public page in the
existing BaseLayout, without its sidebar or floating booking form. It uses the
shared theme, navigation, canonical/social metadata and house photograph. It is
included in the sitemap. The initial HTML remains useful without JavaScript.

Opening links lead to `/listings/` and `/book/`. Listing choices use the existing
content collection's titles, capacities and bedroom labels, linking to
`/listings/olrig-bank/`, `/listings/event/` and `/listings/cottage/`. Further links
lead to the approved reviews on the homepage, bespoke stays, contact, the local
guide and `/welcome/`. Guest arrival guidance remains separate from marketing.

Ratings and the two latest endorsements come only from the existing published
review repository. Unpublished reviews are excluded. The average is explicitly
labelled as an average of Airbnb reviews published on this website. Empty or
unavailable review data omits the section without breaking the page. There are
no copied fixed prices or claims that direct booking is always cheaper.

UI pattern names:

- **Plaque introduction** — custom opening panel with history, photograph and early actions.
- **Guest endorsement strip** — custom panel using approved public reviews.
- **Stay choice links** — custom stacked linked cards using shared listing data.
- All navigation actions use native HTML anchors; the existing mobile menu uses
  the browser's details/summary control.

## Tracking

See [Visitor analytics](../analytics.md) for payload privacy, tab-scoped plaque
attribution, bounded pending queue, event names and dashboard/release instructions.
Both pageviews and custom events now sanitise private paths, titles and referrers.
Automatic tracker collection stays disabled in favour of explicit manual payloads.
Existing booking events inherit plaque attribution; the tracker never blocks links.

## Verification

- Production build and Astro check pass (zero errors and warnings; three existing hints).
- 32 plaque Playwright checks pass, covering 320×800, 390×844, 768×1024 and 1440×900: main-content keyboard
  access, document overflow, onward attribution, safe nested private routes and
  referrers, delayed readiness, repeated readiness, reloads, fast onward navigation,
  expired attribution, blocked storage/tracker, unavailable reviews, disabled analytics,
  every content destination and navigation without JavaScript.
- Existing sitemap and welcome test files pass; sitemap coverage includes `/plaque/`.
  A further 24 existing welcome and search-indexing Playwright checks pass.
- Chrome DevTools inspected the rebuilt disposable preview at 320×800, 390×844,
  768×1024 and 1440×900. No document or local content overflow; skip-link focus is
  visible with a 3px outline; link names and heading hierarchy checked. The document,
  photograph, shared logo and analytics bootstrap return 200. No console errors or
  warnings with analytics disabled for the quality audit.
- Lighthouse mobile and desktop: accessibility, best practices, SEO and agentic
  browsing all 100, no failing audits. Initial contrast failures were corrected:
  the plaque kicker avoids the global eyebrow override, and shared footer supporting
  copy now has an explicit accessible colour. The DevTools audit excludes performance.
  Reports are in `/tmp/plaque-lighthouse-mobile-final/` and
  `/tmp/plaque-lighthouse-desktop-final/` for this session.

## Limits and release

No merge, deployment, production setting change or dashboard provisioning was
performed. Analytics regression tests use a mocked tracker API and disposable local
fixtures, not the live collector. Actual production tracker delivery and Umami
reporting must be confirmed after the owner approves a deployment. The stable
DevTools preview deliberately has analytics disabled to avoid sending test visits.
Browser blocking and network failure can prevent delivery; visits cannot prove
physical QR scans or attribute a later visit from another tab/device.
