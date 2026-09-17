# Plain stay names

## Change

Customer-facing names for Olrig Bank, Olrig Bank++ and Cottage at Olrig Bank no longer include a bracketed maximum guest count. This applies to listing titles, stay selection, page copy and metadata. The separate guest capacity data and booking validation remain in place.

**UI pattern:** Plain stay name — custom copy pattern in the existing headings, links and booking selector. The selector itself is a native browser control.

## Verification

- `npm run check` in `site`: 0 errors and 0 warnings (2 unrelated hints).
- `npm run build` in `site`: passed.
- `npm run test:booking-lifecycle` in `site`: 88 passed.
- Playwright over-capacity booking regression: passed at 320 and 1440 px, including the inline validation and continuation check.
- Rebuilt application inspected in Chromium using Chrome DevTools Protocol at 320, 390, 768 and 1440 px. Checked the home page, listing index, all three stay listings, bespoke listing, guest information, contact, local guide and booking page. No bracketed guest counts, document overflow, console exceptions or failed network requests were found. The booking selector exposes the name “Stay”, uses the plain option names and accepts a changed selection. The keyboard skip link had a visible focus outline.
- Lighthouse on the rebuilt listing index: performance 73, accessibility 94, best practices 100, SEO 100. Existing contrast, heading order and image performance findings are outside this copy change.
- Browser checks used local fixtures and did not contact customers. The broader live booking journey was not exercised for this copy change.
