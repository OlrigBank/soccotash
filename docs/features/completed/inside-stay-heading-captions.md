# Inside this stay heading captions

The image cards in the “Inside this stay” section now show only each room or space heading beneath its image. Summaries, capacity facts, features and body copy remain in the space content files but are not rendered in these cards. Listing facts and structured data remain available elsewhere on the page.

**UI pattern:** Heading caption space card — custom UI pattern.

## Verification

- `npm run check`: 0 errors or warnings; 2 unrelated hints.
- `npm run build`: passed.
- `npm run test:booking-lifecycle`: 88 passed.
- Playwright listing card regression: 4 passed at 320, 390, 768 and 1440 px across Olrig Bank, Olrig Bank++ and Cottage listings. Cards contain one heading beneath each image and no document overflow.
- Rebuilt local application inspected in Chromium with Chrome DevTools Protocol at the same four widths. All three stay listings returned 200, image alternative text matched the heading captions, and no console errors or failed requests appeared. Keyboard Tab reached the visible skip link focus outline. The bespoke listing has no “Inside this stay” cards. A lazy-loaded cottage image was visually checked after scrolling into view.
- Lighthouse on the rebuilt Cottage listing: performance 74, accessibility 100, best practices 100, SEO 100. Image delivery and page latency remain performance findings outside this caption-only change.
- Browser checks used local fixtures and did not contact customers.
