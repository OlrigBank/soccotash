# E04-F01 — Prioritise and Compare Ways to Stay

## Status

Completed on 31 August 2026.

## Parent epic

[E04 — Rapid Cleanup of the Landing Page](../epics/completed/e04-f00-rapid-cleanup-of-landing-page.md)

## Objective

Help landing-page visitors understand and compare the three standard ways to
stay immediately after the booking-first hero, before they browse the property
gallery. Reuse the stronger exterior photograph in the hero, remove the now
duplicate photograph from **Ways to stay at Olrig Bank**, and replace the
prose list of arrangements with a direct semantic comparison.

## Proposed experience

### Hero image

- Replace the current first landing-page image with
  `/media/images/listings/house.jpeg`, which is currently used by **Ways to
  stay at Olrig Bank**.
- Preserve eager loading, high fetch priority, meaningful alternative text and
  the existing hero content and Quick Check behavior.
- Review and adjust the responsive crop with `object-position` as necessary.
  The source is 1440×1085 and must remain effective within the hero's wider
  crop at 390×844, 768×1024 and 1440×900.
- Keep the homepage social-preview image aligned with the approved hero image
  unless browser review identifies a poor social crop.

### Landing-page order

The opening content order becomes:

1. booking-first hero and Quick Check;
2. **Ways to stay at Olrig Bank**;
3. **Olrig Bank in pictures**; and
4. the remaining landing-page sections in their existing order.

### Ways-to-stay comparison

- Remove the exterior image from the Ways-to-stay section so the asset is not
  repeated directly beneath the hero.
- Retain the concise historical introduction above the comparison.
- Replace the Markdown bullet list with a semantic comparison table whose
  three prominent accommodation columns are:
  - **Olrig Bank**;
  - **Olrig Bank++**; and
  - **Cottage at Olrig Bank**.
- Include comparison rows for maximum guests, bedrooms and bathrooms. Count a
  bathroom as one complete guest-facing bathroom unit even when its shower or
  bath and toilet occupy separate rooms. Present Olrig Bank++ as having **3
  bathrooms** and the Cottage as having **1 bathroom**, without separately
  advertising either WC:

| Feature | Olrig Bank | Olrig Bank++ | Cottage at Olrig Bank |
| --- | --- | --- | --- |
| Maximum guests | 8 | 12 | 4 |
| Bedrooms | 4 | 6 | 2 |
| Bathrooms | 2 | 3 | 1 |

Olrig Bank++ is formed by combining the main-house accommodation with two
bedrooms and one bathroom otherwise allocated to the Cottage. The comparison
must not imply that Olrig Bank++ and the Cottage can be booked concurrently;
when Olrig Bank++ is in use, the Cottage is unavailable as a separate stay.

- Give each accommodation column a clear link to its existing listing page.
- Retain the existing route to **Olrig Bank Bespoke** and the invitation to ask
  Jenna for help beneath the comparison.

### Responsive table behavior

- Render a real HTML table with correctly scoped column and row headers.
- On narrow screens, keep the three accommodation columns in comparison order
  inside a horizontally scrollable region rather than converting them into
  stacked cards.
- Keep the feature-label column visible while scrolling where this can be done
  without obscuring the accommodation values.
- Provide a visible or accessible indication that the comparison can be
  scrolled horizontally on small screens.
- Horizontal overflow must be contained by the comparison region; the page
  itself must not scroll sideways.
- Links and scroll behavior must remain usable with touch, mouse and keyboard.

## Scope boundaries

- Do not change Quick Check fields, matching, pricing, availability or booking
  continuation behavior.
- Do not change the gallery's photographs, controls or dialog behavior beyond
  moving the gallery below Ways to Stay.
- Do not change listing-page content or accommodation facts.
- Do not redesign the later local-guide, review or footer sections.
- Do not add the dedicated end-of-epic Playwright UI suite in this iteration;
  that remains a separate final development iteration.

## Automated tests

Update the existing homepage contracts and add focused coverage proving that:

1. the approved `house.jpeg` asset is the eager, high-priority hero image;
2. the hero retains meaningful dimensions, alternative text and responsive
   crop rules;
3. **Ways to stay at Olrig Bank** appears after the hero and before
   `HomeGallery`;
4. the Ways-to-stay section contains no image;
5. the section renders a semantic table with scoped feature and accommodation
   headers;
6. the table contains the agreed capacity, bedroom and bathroom facts,
   including **3 bathrooms** for Olrig Bank++ and **1 bathroom** for the
   Cottage, with no separate-WC wording for either arrangement;
7. all three standard listing links and the existing Bespoke/contact routes
   remain present;
8. narrow-screen overflow is contained by the comparison wrapper; and
9. existing Quick Check, gallery, public-review and booking-continuation
   contracts continue to pass.

## Acceptance criteria

1. The landing-page hero uses the former Ways-to-stay exterior photograph and
   presents a deliberate crop at all required review widths.
2. Ways to Stay follows the hero and precedes Olrig Bank in Pictures.
3. Ways to Stay does not display an image.
4. Visitors can compare the three standard arrangements by maximum guests,
   bedrooms and bathrooms in one semantic table.
5. Each arrangement has a working link to its existing listing.
6. Bespoke and host-help routes remain available below the comparison.
7. At mobile widths, the table scrolls horizontally within its own region and
   does not create page-level horizontal overflow.
8. The comparison remains readable and operable at 390×844, 768×1024 and
   1440×900.
9. The landing page has no new console errors, failed requests or broken
   interaction.
10. All updated and relevant regression tests pass.

## Iteration validation

- Run the focused homepage contract tests after implementation.
- Run `npm run check` and the relevant broader test suite.
- Run `git diff --check`.
- Rebuild and redeploy the local Docker site as often as necessary during the
  iteration, confirming container and health status after the final rebuild.
- Inspect the deployed landing page at 390×844, 768×1024 and 1440×900.
- At mobile width, verify table scrolling, sticky feature labels, page-level
  overflow, listing links, the mobile menu and the sticky availability action.
- Record actual test, build, deployment and browser results before marking the
  feature complete.

## Validation completed

- The focused homepage hero, comparison and public-discovery contracts passed.
- The complete booking-lifecycle suite passed all 73 tests.
- `npm run check` completed with no errors or warnings and one pre-existing
  unused-variable hint in `src/pages/admin/login.astro`.
- `git diff --check` completed cleanly.
- The production Docker image passed its Astro check and build, and the
  recreated `site` container reported healthy.
- The local health endpoint and HTTPS landing page both returned HTTP 200.
- Playwright reviewed the deployed page at 390×844, 768×1024 and 1440×900.
- The deployed hero loaded `house.jpeg` at its intrinsic 1440×1085 size with
  the approved responsive crop.
- Ways to Stay rendered before the gallery and contained no image.
- The comparison displayed capacity 8/12/4, bedrooms 4/6/2 and bathrooms
  2/3/1 with working links to all three listings, Bespoke and contact.
- At 390px, the 704px table scrolled inside its 357px region, the feature
  labels remained fixed while scrolling and the page itself had no horizontal
  overflow. At tablet and desktop widths the complete table fit without
  scrolling.
- Browser inspection found no console warnings, console errors or failed
  network requests.
