# Local guide category previews and progressive gallery

Implemented on `feat/local-guide-image-gallery`, 7 October 2026.

The public local guide retains its nested, independently expandable categories.
Closed categories show up to four distinct thumbnail images from direct entries
and descendants. Opening a category hides its preview and reveals subcategories
and responsive cards with entry images, titles and short summaries. Each card
opens the Olrig Bank guide entry in a new tab. Missing images leave a text card;
categories without images omit their preview strip.

## UI patterns

- **Category image preview**: custom thumbnail strip inside the native browser
  `details`/`summary` disclosure. Clicking a thumbnail toggles its category.
- **Progressive entry gallery**: custom responsive card grid and scroll-triggered
  continuation, using native links and a native button. Twelve direct entries
  appear initially, followed by batches of twelve. The keyboard-accessible
  “Show more recommendations” button supports manual continuation. The final
  manual continuation retains focus and announces completion.

Open folders retain session state. Closing and reopening retains revealed cards.
Without JavaScript every entry remains available. Images load lazily and reserve
space. The planner's text, drag and add controls and standalone guide routes
retain their existing behaviour. No migration, credentials or API changes are
required.

## Verification

- Astro check: zero errors or warnings; two existing admin hints. Production
  build passed. All 91 lifecycle test files passed, including planner contracts;
  the three tree tests also passed when executed directly.
- Playwright: 16 gallery cases at 320 × 800, 390 × 844, 768 × 1024 and
  1440 × 900. Covers keyboard disclosure/focus, new-tab entry pages, no-JavaScript
  access, independent categories, automatic/manual batches, close/reopen and
  completion. A presentation response expands one category to 27 cards because
  the published baseline has fewer than 12 direct entries in every category.
- Chrome DevTools inspected the rebuilt production preview with a disposable
  local database at 390 × 844, 768 × 1024 and 1440 × 900. Closed previews and
  expanded nested image cards rendered correctly; no horizontal document
  overflow, broken loaded images, console errors or warnings were found. The
  skip link had visible keyboard focus; Playwright checks category focus too.
- Final mobile Lighthouse snapshot: accessibility 96, best practices 100,
  SEO 100 and agentic browsing 100. The sole failed audit is the previously
  documented shared-footer paragraph contrast (2.4:1), outside this guide change.
  No new gallery accessibility failures were reported. Reports are in
  `/tmp/guide-lighthouse-final/` for this session.

This verification uses disposable fixtures and does not change published guide
content, contact customers or deploy the implementation. Server-loaded entries
are progressively revealed; this version does not fetch pages from an API.
