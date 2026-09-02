# E04-F03 — Tighten History and Comparison Labels

## Status

Completed on 31 August 2026.

## Parent epic

[E04 — Rapid Cleanup of the Landing Page](../epics/completed/e04-f00-rapid-cleanup-of-landing-page.md)

## Objective

Make three focused copy improvements to the E04 landing-page hero and stay
comparison without changing layout, pricing sources or booking behavior.

## Approved changes

### Hero supporting copy

Replace the current historical sentence and follow it immediately with the
existing location proposition, using this exact two-sentence sequence:

> Built in 1879 as a family home for George MacKay, a Mayor of Kendal and owner
> of the nearby Aynam Mills. Today, small to large groups of guests can enjoy a
> comfortable base from where they can explore Kendal on foot and have easy
> access to all the attractions the surrounding region has to offer.

Use **nearby** as one word and retain **Aynam Mills** as the proper name.
Remove the Today sentence from the Choosing-your-stay introduction so it is not
repeated. Keep the approved medium/large-group sentence in that section.

### Comparison caption

Replace **Compare the three standard ways to stay at Olrig Bank** with:

> Swipe sideways to compare all stays.

Use this as the comparison table's visible caption. Remove the separate mobile
hint so the instruction appears once rather than being repeated. The caption
remains useful at all widths even when the complete comparison fits without
scrolling.

### Base-price row

Change the feature label from **Base price** to **Base price per night**.
Display only the formatted currency amount in each accommodation cell:

| Feature | Olrig Bank | Olrig Bank++ | Cottage at Olrig Bank |
| --- | --- | --- | --- |
| Base price per night | £395 | £595 | £200 |

The figures remain dynamic examples sourced from the published pricing plans.
Do not hard-code them or change the missing-price fallback **Ask for price**.

## Scope boundaries

- Do not change the hero title, image or responsive crop.
- Do not change the Choosing-your-stay heading or medium/large-group sentence.
- Do not change table dimensions, sticky labels or horizontal scrolling.
- Do not change price retrieval, published pricing plans or Quick Check.

## Automated tests

Update focused contracts to prove that:

1. the hero contains the exact approved two-sentence copy in the correct order;
2. the old 1879 wording and duplicate Today paragraph are absent;
3. the table caption is exactly **Swipe sideways to compare all stays.**;
4. the separate duplicate scroll hint is absent;
5. the row heading is **Base price per night**;
6. formatted price cells contain currency amounts without repeated **per night**;
7. **Ask for price** remains the missing-price fallback; and
8. existing pricing-source, scrolling, ordering and booking contracts pass.

## Acceptance criteria

1. The deployed hero displays the approved history and location copy without a
   duplicate paragraph in Choosing Your Stay.
2. The comparison displays one sideways-scroll instruction.
3. The base-price row reads naturally without repeating **per night** in every
   cell.
4. Current published prices remain correct at all three target widths.
5. The page has no new overflow, console errors or failed requests.

## Iteration validation

- Run the focused homepage and base-price tests.
- Run the complete booking-lifecycle suite, `npm run check` and
  `git diff --check`.
- Rebuild and redeploy the local Docker site.
- Inspect the deployed hero and comparison at 390×844, 768×1024 and 1440×900.

## Validation completed

- Focused hero, comparison and base-price tests passed.
- The complete booking-lifecycle suite passed all 74 tests.
- `npm run check` completed with no errors or warnings and one pre-existing
  unused-variable hint in `src/pages/admin/login.astro`.
- `git diff --check` completed cleanly.
- The Docker image rebuilt successfully and the recreated site container
  reported healthy.
- Playwright verified the exact approved hero copy, one comparison caption and
  the **Base price per night** row with £395/£595/£200 at 390×844, 768×1024 and
  1440×900.
- The comparison remained internally scrollable at 390px, fitted at the two
  wider viewports and introduced no page-level horizontal overflow.
- Browser inspection found no console warnings or errors.
