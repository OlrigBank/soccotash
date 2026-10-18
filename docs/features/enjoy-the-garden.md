# Enjoy the garden

Implemented on 9 October 2026. The public `/enjoy-the-garden/` page transcribes
the supplied “Olrig Bank — Use of the Garden” image into editable Markdown in
the Pages CMS **General pages** collection. The existing welcome topic links to
this page; the standard route and sitemap collection include it automatically.

The opening copy, neighbour consideration, two rules and closing thank-you are
preserved. **21:30** and **planned event** receive strong emphasis. The rules
use a semantic unordered list rather than an image of text.

## UI pattern

**General information page** — an existing custom site pattern, comprising the
shared public layout, one hero heading and a prose panel. The list and emphasis
use native HTML elements. No new bespoke controls or shared layout changes.

## Verification

- `npm run build` passed and generated `/enjoy-the-garden/index.html`.
- `npm run check` passed with no errors or warnings; it reported two existing
  hints in the admin login and local-guide pages.
- Playwright garden regression coverage passed all eight cases at 320 × 800,
  390 × 844, 768 × 1024 and 1440 × 900. It checks the welcome link's accessible
  name, visible keyboard focus and Enter navigation, the complete rules and
  closing message, no document overflow or page errors, and direct loading
  without JavaScript at each viewport.
- Chrome DevTools inspected the rebuilt Astro preview at 390 × 844,
  768 × 1024 and 1440 × 900, including screenshots, accessible structure,
  document/local overflow, keyboard navigation and visible focus. The page has
  one level-one heading and readable guidance at all widths. No document
  overflow occurred. Local overflow measurements on phone were confined to the
  shared booking panel's closed guest disclosure, outside the rendered guidance.
  Keyboard Enter on the welcome garden link opened the new page; its focus
  outline and the skip link's outline were visible.
- Chrome DevTools found no console warnings or errors; all six recorded page
  and asset requests returned HTTP 200. The slashless requested URL resolves
  to `/enjoy-the-garden/`, with canonical URL
  `https://olrig-bank.com/enjoy-the-garden/`.
- Lighthouse mobile and desktop navigation audits each scored 100 for
  accessibility, best practices, SEO and agentic browsing, with zero failed
  audits (56 mobile passes and 51 desktop passes).

Verification used only local public pages, without credentials, customer contact
or booking submission. This static information page has no empty or validation
states. The Lighthouse tool excludes performance. DevTools screenshots were
inspected inline and its reports remained in tool-managed temporary storage
because its file writer could not access the repository; this record captures
the findings. No deployment or production-data change was performed.
