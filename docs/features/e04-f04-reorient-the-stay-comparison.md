# E04-F04 — Reorient the Stay Comparison

## Status

Completed and approved on 1 September 2026.

## Parent epic

[E04 — Rapid Cleanup of the Landing Page](./epics/e04-f00-rapid-cleanup-of-landing-page.md)

## Context

The existing comparison presents accommodation choices as columns and their
features as rows. This makes the table wider than necessary and does not make
each complete stay as easy to scan as a single record.

## Objective

Reorient the **Choosing your stay** table so that each standard stay occupies
one row and its capacity, bedroom count, bathroom count and published base
nightly price can be read compactly across that row.

## Proposed table

The comparison will use this structure, with compact icons accompanying the
visible feature labels in the header:

| Stay | Guests | Bedrooms | Bathrooms | Price/night |
| --- | ---: | ---: | ---: | ---: |
| Olrig Bank | 8 | 4 | 2 | £395 |
| Olrig Bank++ | 12 | 6 | 3 | £595 |
| Cottage at Olrig Bank | 4 | 2 | 1 | £200 |

The displayed prices are dynamic examples. They continue to come from each
arrangement's enabled `default_nightly_price` rule in its current published
pricing plan and must not be hard-coded.

## Header and accessibility requirements

- Change the first column heading from **Feature** to **Stay**.
- Use one compact icon plus a short visible label for each remaining column:
  **Guests**, **Bedrooms**, **Bathrooms** and **Price/night**.
- Treat the icons as decorative when the adjacent visible text supplies the
  heading, so assistive technology does not announce duplicate labels.
- Retain correctly scoped column headings and make each linked stay name the
  row heading for its row.
- Retain an accessible table caption, visually hidden, that identifies the
  table as a comparison of stays at Olrig Bank.
- Remove the visible **Swipe sideways to compare all stays.** caption without
  replacing it with another visible scrolling instruction.

## Responsive behavior

- Keep the presentation as a semantic table at every viewport width.
- Make the layout as compact as practical through concise headings, controlled
  column widths and tight but usable spacing.
- Allow horizontal scrolling only inside the comparison region when all
  columns cannot fit.
- Keep the **Stay** column fixed at the left while the feature columns scroll.
- Prevent the sticky column from obscuring values or allowing underlying text
  to show through it.
- Do not introduce page-level horizontal overflow.
- Preserve touch, mouse and keyboard access to the comparison region and stay
  links.

## Scope boundaries

- Do not change the stay names, links, capacity, bedroom or bathroom facts.
- Do not change published-price retrieval, formatting or the **Ask for price**
  fallback.
- Do not change the Choosing-your-stay copy outside the table.
- Do not change Quick Check, availability, quote calculation or booking
  continuation behavior.
- Do not change the gallery or any later landing-page section.
- Do not add the dedicated end-of-epic Playwright UI suite in this iteration.

## Automated tests

Update the focused homepage contracts to prove that:

1. **Stay**, **Guests**, **Bedrooms**, **Bathrooms** and **Price/night** are
   correctly scoped column headings;
2. each visible feature label is accompanied by a decorative icon;
3. the three linked stay names are row headings in the agreed order;
4. each row contains the correct capacity, bedroom and bathroom facts;
5. each row uses the correct arrangement's dynamic published base price;
6. the existing **Ask for price** fallback remains supported;
7. the visible sideways-swiping instruction is absent and the table retains a
   visually hidden descriptive caption;
8. the comparison wrapper contains narrow-screen overflow and the **Stay**
   column remains sticky; and
9. existing ordering, stay links, Bespoke/contact routes, pricing-source and
   booking-continuation contracts continue to pass.

## Acceptance criteria

1. Each of the three standard stays appears as one complete table row.
2. Compact icon-and-label headings clearly identify all four compared
   features.
3. Stay names remain working links and row headings.
4. Current published prices appear against the correct stays without copied or
   hard-coded values.
5. The **Stay** column remains fixed whenever horizontal scrolling is required.
6. No visible sideways-swiping instruction remains.
7. The comparison is readable and operable at 390×844, 768×1024 and 1440×900.
8. The page has no new horizontal overflow, console errors, failed requests or
   broken interactions.
9. All updated and relevant automated tests pass.

## Iteration validation

- Run the focused homepage comparison and base-price tests.
- Run the complete booking-lifecycle suite, `npm run check` and
  `git diff --check`.
- Rebuild and redeploy the local Docker site.
- Confirm the final container and health endpoint are healthy.
- Inspect the deployed comparison at 390×844, 768×1024 and 1440×900.
- Verify header clarity, stay-row alignment, internal scrolling, the sticky
  **Stay** column, listing links and the absence of page-level overflow.
- Check console messages and network requests before requesting sign-off.

## Validation completed

- The focused homepage comparison and base-price test files passed.
- The complete booking-lifecycle suite passed all 74 tests.
- `npm run check` completed with no errors or warnings and one pre-existing
  unused-variable hint in `src/pages/admin/login.astro`.
- `git diff --check` completed cleanly.
- The production Docker image passed its Astro check and build, and the
  recreated `site` container reported healthy.
- The deployed landing-page response contains the transposed three-row table,
  compact icon-and-label headings, dynamic £395/£595/£200 prices and no visible
  sideways-swiping instruction.
- Playwright inspected the deployed landing page and captured full-page
  screenshots at 390×844, 768×1024 and 1440×900.
- At 390px, the 597px table scrolled inside its 357px region while the **Stay**
  column remained fixed; keyboard arrow keys moved the region from 0px to
  200px, and the page itself had no horizontal overflow.
- At 768px and 1440px, the complete table fitted its region without scrolling,
  all four icon-and-label headings remained on one line and the page had no
  horizontal overflow.
- Browser inspection confirmed the correct three stay rows and published
  prices, working listing destinations, no visible sideways-swiping text, no
  console messages and HTTP 200 responses for every page request.
- The deployed result was approved on 1 September 2026.
