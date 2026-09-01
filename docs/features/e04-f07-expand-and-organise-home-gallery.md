# E04-F07 — Expand and Organise the Home Gallery

## Status

Completed and approved on 1 September 2026.

## Parent epic

[E04 — Rapid Cleanup of the Landing Page](./epics/e04-f00-rapid-cleanup-of-landing-page.md)

## Context

The **Olrig Bank in pictures** gallery currently exposes only six selected
images in one rail: four main-house rooms, one Cottage room and one garden
view. The repository already contains a much fuller photographic record, but
visitors cannot browse it from the landing page and indoor and outdoor images
are mixed together.

## Objective

Retain **Take a look around** and **Olrig Bank in pictures**, then organise the
available photographs into exactly two clearly labelled galleries:

1. **Inside Olrig Bank**; and
2. **In the garden**.

Every available main-house room, Cottage room and garden photograph must be
reachable from the landing page without combining indoor and outdoor images in
one navigation sequence.

## Inside Olrig Bank

The indoor gallery will contain all 29 available room photographs.

### Main house

Present all 18 main-house interior photographs first, grouped in this room
order:

1. hall;
2. lounge;
3. dining room;
4. kitchen;
5. bedrooms 1–4; and
6. bathrooms 1–2.

Include every image in each corresponding directory, including images not
currently listed in a space content record.

### Cottage

Follow the main-house photographs with all 11 Cottage interior photographs in
this room order:

1. lounge;
2. kitchen;
3. bedrooms 1–2;
4. bathroom;
5. WC;
6. hall;
7. landing; and
8. mezzanine.

Captions and alternative text must clearly distinguish Cottage rooms from
main-house rooms. Repeated views of one room should have distinct, natural
descriptions rather than filename-derived labels.

## In the garden

- Include all 9 photographs currently stored in
  `site/public/media/images/spaces/garden/`.
- Keep these images out of the indoor gallery and its navigation sequence.
- Give each photograph useful alternative text and a concise visible caption.
- Choose a deliberate visual order that begins with a strong overview and then
  shows the different garden spaces and details without relying on UUID
  filename order.

## Gallery presentation and behaviour

- Retain the existing main eyebrow and heading.
- Place the two gallery subsections one after the other, each with a visible
  subsection heading, current-position count and previous/next controls.
- Keep each gallery as a compact responsive horizontal rail: one prominent
  card on phones, two on tablets and three on wider screens.
- Scope rail movement, counts and keyboard interaction independently so using
  one gallery cannot change the other gallery's state.
- Selecting a card opens the full-screen photo viewer at that photograph.
- Scope previous/next buttons and Left/Right keys in the viewer to the gallery
  from which it was opened. Navigation wraps within that gallery and never
  crosses between indoor and garden photographs.
- Preserve an obvious close button, backdrop closing, Escape behaviour,
  appropriate focus handling and descriptive accessible labels.
- Retain lazy loading for rail images and load the selected full-size viewer
  image when required.
- Do not introduce page-level horizontal overflow.

## Source-of-truth requirements

- Define the complete ordered photo inventory explicitly rather than relying
  on filesystem directory order at runtime.
- Do not rename, copy, regenerate, edit or delete the source image files.
- Detect missing files, duplicate paths and accidental omissions through
  focused automated contracts.
- Keep image paths under the existing `/media/images/spaces/` public hierarchy.

## Scope boundaries

- Do not add a third visible gallery section.
- Do not change the **Take a look around** eyebrow or **Olrig Bank in pictures**
  heading.
- Do not change the relative position of the gallery between **Choosing your
  stay** and **What our guests say**.
- Do not change the review section, local guide or any booking behaviour.
- Do not change individual listing-page galleries or space content records in
  this iteration.
- Do not add the dedicated end-of-epic Playwright UI suite in this iteration.

## Automated tests

Add or update focused homepage-gallery contracts to prove that:

1. exactly two visible galleries are rendered with the agreed headings;
2. **Inside Olrig Bank** contains exactly 29 unique paths: all 18 main-house
   room photographs followed by all 11 Cottage room photographs;
3. **In the garden** contains exactly all 9 unique garden paths;
4. every configured path exists in the public image library and no path occurs
   in both galleries;
5. indoor ordering follows the agreed main-house and Cottage room order;
6. every image has non-empty alternative text and a visible caption, with
   Cottage descriptions clearly identified;
7. each rail has independent count and navigation controls;
8. the viewer opens in and remains scoped to the originating gallery, including
   wraparound, keyboard and closing behaviour;
9. responsive styles retain one-, two- and three-card rails without page-level
   overflow; and
10. existing homepage order, review, anchor-link and booking-lifecycle
    contracts continue to pass.

## Acceptance criteria

1. **Olrig Bank in pictures** visibly contains only **Inside Olrig Bank** and
   **In the garden** as its two gallery subsections.
2. All 29 indoor photographs and all 9 garden photographs are available in the
   correct subsection.
3. Main-house photographs precede Cottage photographs, and room captions make
   their location clear.
4. The two rails maintain independent positions, counts and controls.
5. The full-screen viewer remains within its originating indoor or garden
   collection and supports buttons, keyboard navigation and reliable closing.
6. Gallery cards are readable and operable at 390×844, 768×1024 and 1440×900.
7. The page has no new horizontal overflow, console errors, failed image
   requests or broken interactions.
8. All updated and relevant automated tests pass.

## Iteration validation

- Run the focused homepage-gallery and homepage-order tests.
- Run the complete booking-lifecycle suite, `npm run check` and
  `git diff --check`.
- Rebuild and redeploy the local Docker site.
- Confirm the final container and health endpoint are healthy.
- Inspect both deployed galleries at 390×844, 768×1024 and 1440×900.
- At each width, verify image inventory, ordering, captions, responsive card
  count, independent rail controls and absence of page-level overflow.
- Open the first and last image of each gallery and exercise viewer buttons,
  wraparound, Left/Right keys, close button, backdrop and Escape closing.
- Check console messages and image/network requests before requesting sign-off.

## Validation completed

- The focused gallery, homepage-order and public-review contracts passed.
- The complete booking-lifecycle suite passed all 76 tests.
- `npm run check` completed with no errors or warnings and one pre-existing
  unused-variable hint in `src/pages/admin/login.astro`.
- `git diff --check` completed cleanly.
- The production Docker image passed its Astro check and build, and the
  recreated `site` container reported healthy.
- The gallery inventory contract confirmed 29 ordered indoor paths, 9 ordered
  garden paths, 38 unique files, non-empty captions and alternative text, and
  clear Cottage identification.
- Direct browser inspection confirmed one-card rails at 390×844, two-card rails
  at 768×1024 and three-card rails at 1440×900 with no page-level horizontal
  overflow or broken loaded images.
- Browser inspection confirmed the gallery remains between **Choosing your
  stay** and **What our guests say**, and found no console warnings or errors.
- Indoor viewer controls and Left/Right keys wrapped from 1 to 29 and back to
  1. Close-button, Escape and blank viewer-background closing returned focus to
  the originating card.
- The indoor and garden controls maintained independent counts. A desktop
  inspection identified and corrected a control path that could advance the
  count without visibly moving an already-visible card; each action now scrolls
  the selected card to the start of its rail.
- The deployed result was approved on 1 September 2026.
