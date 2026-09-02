# E04-F02 — Refine Landing Copy and Show Base Prices

## Status

Completed on 31 August 2026.

## Parent epic

[E04 — Rapid Cleanup of the Landing Page](../epics/completed/e04-f00-rapid-cleanup-of-landing-page.md)

## Context

E04-F01 placed the comparison of standard stays immediately after the hero.
This follow-on iteration strengthens the property's opening proposition,
removes booking-control instructions from the hero copy and adds published
base nightly prices to the comparison.

## Objective

Present Olrig Bank first as a secluded yet central place to stay, then help
visitors choose an arrangement using group suitability, accommodation facts
and authoritative base prices.

## Approved copy

### Landing-page hero

Change the landing-page title to:

> Olrig Bank: secluded in the heart of Kendal

Replace **Choose your dates and tell us who is coming to check availability and
find the stay that suits you.** with the opening historical sentence moved from
the current Ways-to-stay introduction:

> Olrig Bank was built in 1879 for George MacKay, a Mayor of Kendal.

The Quick Check controls remain directly beneath this copy and keep their
existing behavior.

### Choosing your stay

Change **Ways to stay at Olrig Bank** to:

> Choosing your stay

Replace the current introduction with these two paragraphs, in this order:

> Today, small to large groups of guests can enjoy a comfortable base from
> where they can explore Kendal on foot and have easy access to all the
> attractions the surrounding region has to offer.

> Olrig Bank is best used by medium or large groups of guests who wish to enjoy
> their time there together.

Use **comfortable**, correcting the supplied draft's `comfirtable` typo.

## Base-price comparison

Add a **Base price** row to the existing semantic comparison table after the
Bathrooms row.

The values must come from each arrangement's enabled
`default_nightly_price` rule in its current published pricing plan. Do not
duplicate the price amounts in landing-page content or presentation code.
Format GBP amounts as whole pounds when there are no pence and make the nightly
basis explicit:

| Feature | Olrig Bank | Olrig Bank++ | Cottage at Olrig Bank |
| --- | --- | --- | --- |
| Base price | £395 per night | £595 per night | £200 per night |

These are the published local values observed when this feature was proposed;
they are acceptance examples, not hard-coded configuration.

If an arrangement has no enabled published default nightly price, display
**Ask for price** for that arrangement without failing the landing page or
inventing a value.

The row communicates a starting nightly amount, not a quote. Date overrides,
packages, party composition, fees and other pricing rules can change the
actual stay total calculated by Quick Check.

## Scope boundaries

- Do not change the hero image or the E04-F01 responsive crop.
- Do not change the Quick Check fields, matching, quote calculation,
  availability or continuation behavior.
- Do not change the order of Choosing Your Stay and the gallery.
- Do not change the comparison's capacity, bedroom or bathroom facts.
- Do not change listing-page copy in this iteration.
- Do not add the dedicated end-of-epic Playwright UI suite in this iteration.

## Automated tests

Update and extend the landing-page contracts to prove that:

1. the hero title is exactly **Olrig Bank: secluded in the heart of Kendal**;
2. the hero supporting copy contains the 1879 George MacKay sentence and no
   longer contains the former Choose-your-dates instruction;
3. the section heading is exactly **Choosing your stay**;
4. the two approved introductory paragraphs appear in the agreed order;
5. the comparison includes a **Base price** row;
6. prices are obtained from enabled default-nightly rules in published plans
   for `main-house`, `whole-property` and `cottage`;
7. GBP values are formatted as pounds per night in the correct arrangement
   columns;
8. a missing published base price produces **Ask for price** rather than a
   page failure or a fabricated amount;
9. no old price remains cached or hard-coded after a published plan changes;
   and
10. existing E04-F01 ordering, table scrolling, accommodation facts, links,
    Quick Check and public-discovery contracts continue to pass.

## Acceptance criteria

1. The deployed hero displays the approved title and historical sentence.
2. The deployed comparison section is headed **Choosing your stay** and
   displays the two approved paragraphs without spelling errors.
3. The comparison shows the current published base price for each standard
   arrangement with **per night** visible.
4. The amounts reflect the current published plans and cannot silently diverge
   because the same values were copied into page content.
5. Missing pricing degrades to **Ask for price** without breaking the page.
6. The base-price row remains readable within the horizontally scrollable
   mobile table.
7. The page has no horizontal overflow, console errors, failed requests or
   broken interactions at 390×844, 768×1024 and 1440×900.
8. All updated and relevant automated tests pass.

## Iteration validation

- Run focused copy, pricing and homepage comparison tests.
- Run the complete booking-lifecycle contract suite.
- Run `npm run check` and `git diff --check`.
- Rebuild and redeploy the local Docker site as often as necessary.
- Confirm the final container and health endpoint are healthy.
- Inspect the deployed title, copy and current base prices at 390×844,
  768×1024 and 1440×900.
- Verify the mobile table still scrolls internally, its feature labels remain
  visible and the page itself does not scroll horizontally.
- Check console messages and network requests before marking the iteration
  complete.

## Validation completed

- Added focused tests for the published-plan query, missing-price fallback,
  GBP formatting and absence of hard-coded homepage prices.
- The complete booking-lifecycle suite passed all 74 tests.
- `npm run check` completed with no errors or warnings and one pre-existing
  unused-variable hint in `src/pages/admin/login.astro`.
- `git diff --check` completed cleanly.
- The production Docker image passed its Astro check and build, and the
  recreated `site` container reported healthy.
- Playwright verified the deployed copy and database-backed base prices at
  390×844, 768×1024 and 1440×900.
- The deployed comparison showed £395, £595 and £200 per night from the local
  published pricing plans in the correct arrangement columns.
- At 390px, the comparison remained horizontally scrollable inside its own
  region with no page-level overflow. It fitted without scrolling at tablet
  and desktop widths.
- Browser inspection found no console warnings, console errors or failed
  network requests.
