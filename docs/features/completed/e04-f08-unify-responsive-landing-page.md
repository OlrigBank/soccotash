# E04-F08 — Unify the Responsive Landing Page

## Status

Completed on `agent/unify-responsive-landing-page`.

## Parent epic

[E04 — Rapid Cleanup of the Landing Page](../epics/completed/e04-f00-rapid-cleanup-of-landing-page.md)

## Context

The landing page currently presents materially different desktop and mobile
compositions. Desktop reserves 260px for a persistent navigation sidebar and
places Quick Check inside the hero. Mobile removes the visible sidebar, hides
the hero panel and renders a second Quick Check instance in a fixed bottom
dock. Guest reviews advance in fixed groups of three, displayed in a row on
desktop but stacked into a tall group on phones.

Live review at 1440×900 and 390×844 found no page-level overflow, broken
images, console warnings, console errors or failed non-static requests. It also
found that the mobile page is approximately 1,000px taller, principally because
each review step contains three vertically stacked cards.

## Objective

Create one progressively responsive landing-page experience. Remove the
persistent public sidebar, widen and centre the shared content shell, render
one authoritative homepage Quick Check instance, and make reviews use one
consistent item-based carousel model from phone to desktop.

## Shared page shell and navigation

- Remove the persistent public sidebar from the landing page at desktop widths.
- Retain the compact header and its **Menu** disclosure at every viewport.
- Preserve every existing public navigation destination and current-page
  semantics in the header menu and footer.
- Widen and centre the landing-page content within the existing site maximum
  width while retaining readable paragraph measures.
- Use the additional desktop width deliberately for the hero, comparison,
  galleries, reviews and local-guide presentation.
- Do not remove the sidebar from other pages unless shared-shell changes make
  that necessary and the affected routes are explicitly reviewed.

## Unified Quick Check

- Render one homepage `CompactBookingPanel` instance rather than separate hero
  and mobile-dock instances.
- Present that instance within the hero on tablet and desktop.
- Present the same instance as the fixed bottom Quick Check dock on phones.
- Preserve the existing mobile date, guest and result sheets, including commit
  and cancellation behaviour, focus trapping, focus restoration, Escape and
  backdrop handling.
- Preserve authoritative availability, pricing, property selection and booking
  continuation parameters.
- Keep the non-homepage mobile **Check availability** action unchanged.

## Harmonised guest reviews

- Replace fixed groups of three with one ordered sequence of individual review
  items.
- Use one horizontal carousel interaction model at every viewport.
- Show one prominent review card on phones, two where tablet width permits and
  three on desktop.
- Advance previous/next buttons, Left/Right keys and horizontal swipe by one
  review consistently.
- Keep the selected review visible after responsive viewport changes.
- Report the selected position as **Review N of total** rather than a range of
  three reviews.
- Give mobile users a visible partial-next-card or equivalent cue that the rail
  continues horizontally.
- Preserve review order, excerpts, independent **More…** expansion, ratings,
  attribution, listing and Airbnb provenance.
- Keep the category-rating summary below the review carousel and vary only its
  internal responsive column layout.
- Respect reduced-motion preferences and prevent page-level horizontal
  overflow.

## Scope boundaries

- Do not change landing-page copy, accommodation facts, prices or section order.
- Do not change the gallery inventory, viewer or collection boundaries.
- Do not change the public review or review-summary datasets.
- Do not change booking matching, availability, pricing or continuation logic.
- Do not redesign non-homepage public routes beyond any shared-shell adjustment
  required to keep their existing presentation working.
- Do not add the final end-of-epic Playwright regression suite in this
  iteration; update focused contracts now and retain the durable suite as a
  separate final feature.

## Automated tests

Update focused contracts to prove that:

1. the landing page does not render the persistent sidebar at desktop widths;
2. the header menu and footer retain all public destinations;
3. one homepage Quick Check instance supplies both static desktop and fixed
   mobile presentations;
4. non-homepage mobile booking actions remain unchanged;
5. Quick Check date, guest, result and continuation behaviour is preserved;
6. every public review appears exactly once in source order;
7. review navigation advances one item and reports **Review N of total**;
8. review expansion remains independent per card;
9. responsive rules expose one, two and three review cards at the intended
   widths without changing the interaction model; and
10. existing homepage, gallery, review-data and booking-lifecycle contracts
    continue to pass.

## Acceptance criteria

1. The landing page uses the compact header menu and no persistent sidebar at
   390×844, 768×1024 and 1440×900.
2. The centred desktop content uses the recovered width without producing
   overlong copy or unbalanced empty space.
3. Exactly one homepage Quick Check component exists and appears in the hero on
   tablet/desktop and as the fixed dock on phones.
4. Mobile sheets and booking continuation retain their current authoritative
   behaviour and accessibility.
5. Reviews use one item-based carousel with one visible card on phones, two on
   tablets where space permits and three on desktop.
6. Review buttons, keyboard arrows and swipe advance by one review; the count
   announces the selected review accurately.
7. The mobile review section is materially shorter than the current three-card
   stacked presentation.
8. Gallery, comparison, ratings and local-guide content remain complete and
   correctly ordered.
9. No reviewed viewport has page-level horizontal overflow, hidden controls,
   failed images, console errors or failed requests.
10. All focused and relevant regression tests pass.

## Iteration validation

- Run the focused homepage-shell, compact-panel and public-review tests.
- Run the complete booking-lifecycle suite, `npm run check` and
  `git diff --check`.
- Rebuild and redeploy the primary local Docker site.
- Confirm the final container and health endpoint are healthy.
- Inspect and capture the complete landing page at 390×844, 768×1024 and
  1440×900 using the repository-mandated Playwright MCP.
- Exercise header navigation, review buttons, keyboard arrows, swipe, viewport
  resizing, **More…** expansion and the final shorter carousel range.
- At 390×844, exercise date and guest completion/cancellation, Quick Check
  result opening/closing, focus restoration and booking continuation.
- Check page-level overflow, console messages and failed network requests before
  requesting approval.

## Validation completed

- The complete booking-lifecycle suite passed all 76 tests.
- `npm run check` completed with no errors or warnings and one pre-existing
  unused-variable hint in `src/pages/admin/login.astro`.
- `git diff --check` completed cleanly.
- The production Docker image passed its Astro check and build, and the primary
  `site` container was recreated from that image.
- Playwright verified the deployed landing page at 390×844, 768×1024 and
  1440×900 with no page-level horizontal overflow.
- The landing page rendered without a sidebar at all three widths and used the
  complete 1,180px content shell at desktop width.
- Exactly one homepage Quick Check instance rendered: fixed in a 390×66px
  bottom dock on mobile and presented as a 1,052px band overlapping the hero on
  desktop.
- The final desktop hero preserves the undimmed photograph and confines its
  contrast treatment and copy to a compact panel over the trees in the
  top-left corner.
- The mobile date control opened a modal sheet immediately above the dock;
  desktop used the same component with a non-modal inline calendar.
- Reviews rendered as one, two and three visible cards at phone, tablet and
  desktop widths respectively. Navigation advanced one review and updated the
  live count from **Review 1 of 52** to **Review 2 of 52**.
- Resizing from phone to tablet to desktop retained Review 2 as the selected
  item while exposing only the applicable visible review range. Off-screen
  slides were hidden from assistive content and made inert.
- Final browser inspection found no console warnings, console errors or failed
  non-static requests.
