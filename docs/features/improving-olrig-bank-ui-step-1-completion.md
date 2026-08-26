# Improving the Olrig Bank UI — Step 1 completion record

## Outcome

Complete. The public Olrig Bank opening now provides:

- one compact mobile header with the Olrig Bank Kendal logo, a visible Request
  a stay action and a native disclosure menu;
- an image-led homepage hero with concise copy and two server-rendered actions;
- a direct route from the hero to Ways to stay; and
- a two-sentence orientation to the four accommodation options without a
  separate introductory panel.

Booking, availability and persisted-data behaviour were not changed.

## Automated validation

Completed on 26 August 2026:

- `npm run test:booking-lifecycle`: 62 tests passed;
- `npm run check`: zero errors and zero warnings, with one pre-existing unused
  local hint in `src/pages/admin/login.astro`;
- production build: passed locally and during the Docker image build;
- `git diff --check`: passed; and
- comparison with `development`: no `db/` or migration file changed.

The rebuilt local Docker service returned HTTP 200 for:

- `/`;
- `/book/`;
- `/listings/`;
- `/guest-information/`;
- `/local-guide/`; and
- `/contact/`.

## Responsive browser evidence

Chromium inspected the locally deployed Docker site using the final assets and
styles. `scrollWidth` remained below `innerWidth` at every measured width:

| Viewport width | Document scroll width | Navigation | Hero image rendered size |
| ---: | ---: | --- | --- |
| 375px | 360px | mobile | 342 × 192px |
| 430px | 415px | mobile | 397 × 223px |
| 768px | 753px | mobile | 727 × 472px |
| 1280px | 1265px | desktop | 886 × 592px |

The 320px and 390 × 844 phone layouts were also visually inspected during
implementation. At 390 × 844, the Ways to stay heading appears at the bottom of
the second screen immediately after the hero.

Saved evidence:

- [390 × 844 phone homepage](./evidence/improving-olrig-bank-ui-step-1/homepage-phone-390x844.png);
- [390 × 844 open mobile menu](./evidence/improving-olrig-bank-ui-step-1/mobile-menu-open-390x844.png);
- [768 × 900 tablet homepage](./evidence/improving-olrig-bank-ui-step-1/homepage-tablet-768x900.png); and
- [1280 × 900 desktop homepage](./evidence/improving-olrig-bank-ui-step-1/homepage-desktop-1280x900.png).

## Navigation and progressive enhancement

Keyboard testing focused the native Menu summary and activated it with the
Space key. Chromium reported:

- the summary retained focus;
- the menu opened;
- the focus outline was visible; and
- Home, Ways to stay, Guest information, Local guide and Contact were present
  as ordinary links.

With browser script execution disabled, the rendered page retained:

- the homepage heading;
- the `/book/` Request a stay link;
- the native Menu summary and five public menu links; and
- the Ways to stay section.

The disclosure therefore remains operable through native browser behaviour and
does not depend on client-side JavaScript.

## Contrast evidence

The mobile hero uses white text against `#314733`, producing a contrast ratio
of **10.10:1**.

For desktop, the overlay remains at least 72% opaque across the complete text
region. Calculating the deliberately conservative worst case of the overlay
over a pure-white source pixel gives:

- white heading text: **6.50:1**; and
- 92%-opaque white supporting text: **5.81:1**.

Both exceed the WCAG AA requirement of 4.5:1 for normal text.

## Acceptance summary

All 15 acceptance criteria in the parent epic have supporting implementation,
automated validation or browser evidence. The original property photographs
remain available, the approved hero is a separate image, and no database or
booking-domain behaviour was changed.
