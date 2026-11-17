# Homepage clarity and Olrig Bank Max

Branch: `feature/homepage-clarity-and-olrig-bank-max`, based on local `development`.

The opening now explains the accommodation and Kendal location before the history. Olrig Bank Max replaces Olrig Bank++ across source content and booking labels. Max includes the main house and two bedrooms and a bathroom upstairs in the cottage, reached internally through the house; the cottage front entrance, kitchen and lounge are excluded. Routes and property identifiers are unchanged.

## UI patterns

- **Stay comparison cards (custom):** below 700px, the semantic comparison presents stacked cards with labelled facts; larger screens retain the comparison table.
- **Expandable availability dock (native browser control with custom styling):** `details`/`summary` expands the booking fields on phones, retaining selections and restoring focus on Escape. Nested date and guest controls remain independently operable. This uses a non-modal disclosure rather than adding a modal focus trap.
- **Hero review link (native anchor):** published review score and count link to the review section; absent summaries omit the link.

Prices are described as base nightly prices, retaining the missing-price fallback.

## Verification

- Astro check: no errors or warnings (existing hints remain). Production build passed.
- Booking lifecycle suite: 292 passed.
- Existing homepage Playwright workflows: 29 passed, 3 desktop-only checks skipped at smaller widths; combined with the initial clarity tests: 35 passed, 5 skipped.
- Expanded clarity/state Playwright suite: 18 passed, 2 mobile-only checks skipped at larger widths. Covers 320 × 800, 390 × 844, 768 × 1024 and 1440 × 900; heading, stay descriptions, document overflow, disclosure keyboard operation, preserved form values, focus return and available/unavailable/error response fixtures.
- Chrome DevTools inspected the rebuilt local application at 390 × 844, 768 × 1024 and 1440 × 900, including expanded date controls. No document overflow or console warnings/errors observed. Corrected review-link contrast, mobile card header styling, calendar width/scrolling and nested Escape handling.
- Lighthouse snapshots initially passed all categories at 100. Expanded-calendar inspection exposed skipped heading levels; a booking-section heading corrects that issue. The repeated expanded-calendar audit scored 100 in all four categories with no failing audits.

## Limitations

The preview uses a disposable local database and intercepted availability/quote responses. It shows fixture review figures and missing-price fallbacks, not production rates. No customer credentials, messages, reservation creation, payments, merge or deployment were used. Final request creation and payment workflows are outside this homepage change.
