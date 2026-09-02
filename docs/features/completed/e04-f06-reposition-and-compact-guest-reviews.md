# E04-F06 — Reposition and Compact Guest Reviews

## Status

Completed and approved on 1 September 2026.

## Parent epic

[E04 — Rapid Cleanup of the Landing Page](../epics/completed/e04-f00-rapid-cleanup-of-landing-page.md)

## Context

The landing page currently places **What our guests say** after **Our local
guide**. Its carousel presents one generously sized review at a time and pairs
that review with a comparatively tall category-rating panel. This makes the
section feel detached from the property imagery and consumes more page height
than the content requires.

## Objective

Place guest evidence immediately after **Olrig Bank in pictures** and make the
whole section denser. Present reviews in navigable groups of three compact
cards, retain readable responsive behaviour, and condense the Airbnb rating
summary without removing its scores or provenance.

## Section order

The relevant landing-page order will be:

1. **Choosing your stay**;
2. **Olrig Bank in pictures**;
3. **What our guests say**; and
4. **Our local guide**.

The existing `#guest-reviews` destination must remain unchanged so header,
footer and side-menu links continue to work.

## Review groups

- Divide the existing ordered review collection into consecutive groups of
  three without reordering or omitting reviews.
- Present one group at a time. The final group may contain fewer than three
  reviews when the total is not divisible by three.
- On wider screens, arrange the three reviews as equal compact cards in one
  row.
- On phones, retain the same group of three but stack its cards vertically so
  review text is not squeezed into narrow columns.
- Make carousel navigation operate by group rather than by individual review.
- Make the visible count and accessible labels describe the reviews currently
  displayed and the total, including the shorter final group.
- Preserve keyboard arrow navigation, button navigation, reduced-motion
  behaviour and focus visibility.

## Compact review presentation

- Reduce quote, star, attribution, listing, source and navigation typography
  in proportion to the smaller cards.
- Reduce card and container padding, margins and gaps while retaining clear
  separation and comfortable reading.
- Keep the existing sentence-aware excerpts and accessible **More…** control;
  expanding one review must reveal its full public quote without affecting the
  other cards' state.
- Retain each review's rating, reviewer, stay length and date, listing and
  Airbnb attribution.
- Do not make any review card horizontally scrollable and do not introduce
  page-level overflow.

## Airbnb category ratings

- Rename **The details guests notice** to **Rating by Airbnb category**.
- Retain the overall score, review count, every category name and score, score
  bars and Airbnb source.
- Reduce heading, score, label and supporting-text sizes and tighten the
  panel's padding and vertical gaps.
- Use an efficient multi-column category layout when space permits and a
  readable compact single-column layout on narrow phones.
- Place the rating summary beneath the review carousel so the review group has
  the width needed for three cards on wider screens.

## Scope boundaries

- Do not edit, regenerate, reorder or otherwise change the public review or
  review-summary datasets.
- Do not change the **What our guests say** heading or introductory copy.
- Do not change gallery or local-guide content, only their order relative to
  the review section.
- Do not change header, footer or side-menu guest-review links.
- Do not change Quick Check, availability, pricing or booking continuation.
- Do not add the dedicated end-of-epic Playwright UI suite in this iteration.

## Automated tests

Update the focused homepage and public-review contracts to prove that:

1. **What our guests say** follows **Olrig Bank in pictures** and precedes
   **Our local guide**;
2. reviews are divided into ordered groups containing no more than three cards;
3. all source reviews appear exactly once and a shorter final group is handled;
4. group navigation, visible counts, accessible labels and arrow-key behaviour
   operate in groups of three;
5. **More…** expansion remains independent for each review;
6. the heading reads **Rating by Airbnb category** and the old heading is
   absent;
7. the overall score, category scores, review count and source remain present;
8. responsive styles produce stacked mobile groups, three-column wider groups
   and a compact responsive category grid; and
9. existing review-data, anchor-link and booking-lifecycle contracts continue
   to pass.

## Acceptance criteria

1. The guest-review section appears immediately after the gallery and before
   the local guide.
2. Visitors see reviews in ordered groups of three, with the final group
   allowed to contain fewer cards.
3. A wider viewport shows three compact review cards in a row; a phone stacks
   the same three cards in one navigable group.
4. Review typography and spacing are visibly smaller and more compact while
   remaining readable.
5. Navigation, keyboard access, focus states, accessible group descriptions
   and **More…** controls remain usable.
6. The compact rating panel is headed **Rating by Airbnb category** and retains
   all existing public scores and Airbnb attribution.
7. The page has no new horizontal overflow, console errors, failed requests or
   broken interactions.
8. All updated and relevant automated tests pass.

## Iteration validation

- Run the focused public-review and homepage-order tests.
- Run the complete booking-lifecycle suite, `npm run check` and
  `git diff --check`.
- Rebuild and redeploy the local Docker site.
- Confirm the final container and health endpoint are healthy.
- Inspect the deployed review section at 390×844, 768×1024 and 1440×900.
- At each width, verify section order, group contents, previous/next and
  keyboard navigation, the final shorter group, independent **More…**
  expansion, rating content and absence of page-level overflow.
- Check console messages and network requests before requesting sign-off.

## Validation completed

- The focused public-review contract passed.
- The complete booking-lifecycle suite passed all 75 tests.
- `npm run check` completed with no errors or warnings and one pre-existing
  unused-variable hint in `src/pages/admin/login.astro`.
- `git diff --check` completed cleanly.
- The production Docker image passed its Astro check and build, and the
  recreated `site` container reported healthy.
- The deployed homepage and health routes responded successfully.
- Direct browser inspection at 390×844 confirmed that the review section
  follows the gallery and precedes the local guide, contains 18 ordered groups,
  displays three stacked cards without page-level horizontal overflow and uses
  the **Rating by Airbnb category** heading.
- Browser interaction advanced the visible range from reviews 1–3 to reviews
  4–6 and confirmed that expanding one review leaves adjacent reviews
  collapsed.
- The mobile review was tightened after inspection by reducing sentence-aware
  previews from 230 to 150 characters and using one category column on narrow
  phones.
- The deployed result was approved on 1 September 2026.
