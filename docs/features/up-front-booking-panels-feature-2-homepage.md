# Feature 2 — Homepage Panel and Simplified Actions

## Parent epic

[Up-front Booking Panels on the Landing and Listing Pages](./epics/getting-a-booking-panel%20on%20the%20landing%20page-and%20every-listing-page.md)

## Objective

Make the compact booking panel the homepage's primary next step while retaining
the photographic hero and reducing the public header to the brand and one
clearly labelled menu disclosure.

## Scope

- Place the compact panel immediately below the homepage hero and before Ways
  to stay.
- Remove Request a stay and View ways to stay from the hero.
- Remove the separate Request a stay action from the public header.
- Use one native menu disclosure at phone and desktop widths, presented with a
  hamburger icon and the visible word Menu.
- Preserve every existing top-level public navigation destination.
- Keep Request a stay inside the disclosed menu as a non-JavaScript route to
  the full form; it is no longer a separate header button.
- Preserve Ways to stay cards as ordinary listing links.

## Acceptance criteria

1. The hero retains its approved image, heading and supporting sentence but no
   action buttons.
2. The compact panel is the first section after the hero.
3. Ways to stay follows the compact panel and retains its stable fragment.
4. The public header contains only the linked brand and accessible menu control.
5. The menu remains keyboard and touch operable and exposes all public routes.
6. There is no separate desktop navigation row or header booking button.

## Validation

- Homepage hero, shorter-opening and mobile-navigation contract tests.
- Complete booking-lifecycle contract suite.
- Astro check and production build.
- Browser review at the epic's required phone, tablet and desktop widths.
