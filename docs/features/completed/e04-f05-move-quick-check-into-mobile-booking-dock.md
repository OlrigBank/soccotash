# E04-F05 — Move Quick Check into the Mobile Booking Dock

## Status

Completed and approved on 1 September 2026.

## Parent epic

[E04 — Rapid Cleanup of the Landing Page](../epics/e04-f00-rapid-cleanup-of-landing-page.md)

## Context

The landing page currently presents the complete Quick Check panel inside the
hero at every viewport width. On phones, a separate fixed bottom bar contains
only a **Check availability** link. This duplicates the booking prompt while
the controls needed to act on it can scroll out of view.

## Objective

Move the landing page's mobile Quick Check experience into the existing fixed
bottom area. Keep arrival/departure, the guest summary and the submit action
visible in one compact dock, and present the date selector, detailed guest
selector and Quick Check response as upward-opening sheets over the page.

## Mobile booking dock

At widths below the existing 700px mobile-bar breakpoint, replace the landing
page's fixed **Check availability** link with one compact row containing:

1. a combined **Arrival – Departure** control showing the selected dates;
2. a **Guests** control showing the current party summary; and
3. a **Quick Check** submit button.

The controls should fit within approximately the current fixed bar's height,
respect phone safe-area insets and retain usable touch targets. Long date and
guest summaries may use concise formatting or truncation without hiding their
accessible names or current values.

The dock must remain fixed at the bottom of the viewport without creating
horizontal overflow or obscuring the final page content. It replaces the hero
Quick Check on phones; two independently operable copies must not be exposed to
phone users or assistive technology.

The fixed booking action on other public pages remains unchanged in this
iteration.

## Upward-opening sheets

Each dock control opens its associated content immediately above the fixed
dock. A sheet overlays and obscures the page content beneath it rather than
changing document flow or pushing the page upwards.

Only one sheet may be open at a time. Opening another dock control closes the
current sheet. Every sheet must:

- have an appropriate accessible name and dialog semantics;
- keep its content within the viewport and scroll internally when necessary;
- account for the dock and safe-area inset in its bottom position;
- place focus inside when opened and return focus to its dock control when
  closed;
- close without applying an incomplete change through its × control, Escape
  key or backdrop; and
- remain usable with touch, mouse and keyboard.

### Date sheet

- Reuse the existing Quick Check calendar, month navigation, minimum-night
  rules and disabled-date behavior.
- Preserve the current values until a replacement range is complete or the
  selection is deliberately cancelled.
- After the visitor chooses both arrival and departure, update the compact dock
  labels and close the sheet automatically.
- Keep the sheet open with clear guidance after only an arrival date or after
  an invalid departure choice.

### Guest sheet

- Reuse the existing adults, children, infants and pets controls and their
  minimum values.
- Update the compact guest summary as the party changes.
- Close and retain the selection when the visitor presses **Done**.
- Restore the values that were present when the sheet opened if the visitor
  cancels through ×, Escape or the backdrop.

### Quick Check result sheet

- Submit through the existing authoritative availability, arrangement and
  published-pricing flow.
- Present the existing recommendation, price, guidance and booking-continuation
  action inside a sheet rising above the dock.
- Keep the result open until the visitor follows its action or closes it using
  a prominent × button, Escape or the backdrop.
- Keep loading, validation, unavailable, host-priced and failure states visible
  and understandable within the sheet rather than behind the dock.
- Preserve the exact selected dates, party composition, recommended property
  and continuation query state.

## Tablet and desktop behavior

At 700px and wider, retain the current Quick Check panel inside the hero and do
not display the mobile booking dock or sheets. This iteration does not redesign
the tablet or desktop panel.

## Final hero copy refinement

- Shorten the hero heading to **Olrig Bank**.
- Follow it with the compact facts line **Sleeps up to 12 | 6 bedrooms |
  Dog-friendly | Ideal for large groups**.
- Retain the George MacKay and Aynam Mills history while describing the
  secluded house, large garden, walkable Kendal location and access to the Lake
  District and Cumbrian peninsulas in concise, grammatically correct copy.

## Scope boundaries

- Do not change availability, property matching, pricing or minimum-stay logic.
- Do not change the booking-continuation route or its query-state contract.
- Do not simplify or remove adults, children, infants or pets.
- Do not change fixed booking actions on non-homepage public routes.
- Do not change the hero image or responsive crop.
- Do not add the dedicated end-of-epic Playwright UI suite in this iteration.

## Automated tests

Update and extend focused contracts to prove that:

1. the homepage renders a compact mobile dock with date, guest and Quick Check
   controls instead of the fixed **Check availability** link;
2. phone users are not exposed to a duplicate hero Quick Check;
3. non-homepage public pages retain their current mobile booking link;
4. the mobile dock respects the existing breakpoint, safe-area and page-bottom
   clearance contracts;
5. date, guest and result sheets open above the dock and are mutually exclusive;
6. a valid date range closes its sheet and updates both compact date labels;
7. **Done** closes the guest sheet while cancellation restores its opening
   values;
8. each sheet closes through ×, Escape and backdrop interaction with focus
   restored to its trigger;
9. successful, unavailable, host-priced, validation and request-failure states
   render within the result sheet;
10. the result sheet's continuation action retains property, dates, adults,
    children, infants and pets; and
11. existing compact-panel, recommendation, pricing, booking-continuation and
    mobile-shell contracts continue to pass.

## Acceptance criteria

1. At 390×844, the fixed bottom area visibly contains compact date, guest and
   Quick Check controls without page-level horizontal overflow.
2. The mobile hero no longer displays a second Quick Check panel.
3. Date and guest controls open sheets above the dock, overlaying the page.
4. Completing a date range or pressing guest **Done** closes the relevant sheet
   and preserves the chosen values in the dock.
5. Cancelling an incomplete date or guest edit leaves the previous values
   unchanged.
6. Quick Check results open above the dock and remain available until closed or
   continued.
7. All sheets have a prominent close control and work with keyboard, Escape,
   backdrop and touch interaction.
8. Tablet and desktop retain the current in-hero Quick Check presentation.
9. The booking result and continuation state are unchanged from the existing
   authoritative flow.
10. The page has no new console errors, failed requests, hidden controls or
    inaccessible focus states.
11. All updated and relevant automated tests pass.

## Iteration validation

- Run focused compact-panel, calendar, continuation and mobile UI contracts.
- Run the complete booking-lifecycle suite, `npm run check` and
  `git diff --check`.
- Rebuild and redeploy the local Docker site.
- Confirm the final container and health endpoint are healthy.
- Use the repository-mandated Playwright MCP to inspect and capture screenshots
  at 390×844, 768×1024 and 1440×900.
- At 390×844, exercise date completion and cancellation, guest completion and
  cancellation, Quick Check result opening/closing, keyboard focus restoration,
  Escape, backdrop handling, internal sheet scrolling and continuation state.
- Verify the hero panel remains at 768×1024 and 1440×900 and that the dock is
  absent at those widths.
- Check page-level overflow, console messages and every failed network request
  before requesting sign-off.

## Validation completed

- Added focused contracts for homepage-only dock rendering, responsive
  visibility, sheet positioning and mutual exclusion, date and guest commit or
  cancellation, modal closing, focus restoration, focus looping, result states
  and continuation parameters.
- The complete booking-lifecycle suite passed all 75 tests.
- `npm run check` completed with no errors or warnings and one pre-existing
  unused-variable hint in `src/pages/admin/login.astro`.
- `git diff --check` completed cleanly.
- The production Docker image passed its Astro check and build, and the
  recreated `site` container reported healthy.
- Playwright inspected the deployed landing page and captured the closed dock,
  date sheet, guest sheet and successful result sheet at 390×844, plus the
  complete page at 768×1024 and 1440×900.
- At 390×844, the fixed dock measured 390×66px and contained 44px-high date,
  guest and Quick Check controls without page-level horizontal overflow. The
  hero Quick Check was hidden.
- Playwright confirmed that an incomplete date edit cancelled through Escape
  restored blank values, a completed 20–22 October range closed automatically,
  a guest edit cancelled through the backdrop restored the original party and
  **Done** retained an added child.
- The deployed unavailable result and successful £940 Olrig Bank result both
  opened above the dock. The successful **Reserve** link retained
  `main-house`, both dates, two adults, one child, zero infants and zero pets.
- Sheet close actions restored focus to their dock triggers. Keyboard Tab and
  Shift+Tab looped between the first and last controls in the guest dialog.
- At 768×1024 and 1440×900, the mobile dock was absent and the original hero
  Quick Check remained visible without page-level horizontal overflow.
- The non-homepage contact route retained its fixed **Check availability** link.
- Final browser inspection found no console messages and every page, asset,
  availability and quote request returned HTTP 200.
- Iterative review identified that closing a successful result left the dock's
  submit action hidden. The close path now restores and focuses **Quick Check**;
  Playwright verified it after closing a live £940 result.
- Adding the dock changed emitted stylesheet order and exposed the brown global
  fallback palette. The public green-theme override is now order-independent;
  Playwright confirmed `#49654a` and `#314733` as the deployed accent colours.
- The final hero refinement shortened the heading to **Olrig Bank**, added the
  approved capacity/bedroom/dog/group facts line and replaced the supporting
  paragraph with grammar-checked history, garden and location copy.
- Playwright confirmed the final hero copy at 390×844, 768×1024 and 1440×900.
  The facts line wrapped to two balanced lines on mobile and one line at both
  wider widths, with no horizontal overflow, console messages or failed page
  requests.
- The deployed result was approved on 1 September 2026.
