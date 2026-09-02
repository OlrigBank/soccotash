# E04 — Rapid Cleanup of the Landing Page

## Status

Active.

## Epic summary

Improve the public landing page through short, independently documented and
tested iterations. Prioritise clear accommodation decisions, concise property
copy and responsive presentation while preserving the established Quick Check,
availability, pricing and booking-continuation behaviour.

Each iteration is developed on a dedicated feature branch and may include
several local Docker deployments. A final dedicated iteration will add durable
Playwright UI coverage for the completed landing-page experience.

## Completed iterations

### E04-F01 — Prioritise and compare Ways to Stay

[Feature record](../completed/e04-f01-prioritise-and-compare-ways-to-stay.md)

- promoted the stronger exterior photograph into the hero;
- moved the stay choices before the photo gallery;
- removed the repeated Ways-to-stay image; and
- introduced an accessible, horizontally scrollable comparison table.

### E04-F02 — Refine landing copy and show base prices

[Feature record](../completed/e04-f02-refine-landing-copy-and-show-base-prices.md)

- repositioned the hero around Olrig Bank's secluded central location;
- renamed the comparison section **Choosing your stay**; and
- added published, database-backed base nightly prices with a safe fallback.

### E04-F03 — Tighten history and comparison labels

[Feature record](../completed/e04-f03-tighten-history-and-comparison-labels.md)

- consolidated the property history and location proposition in the hero;
- reduced the scrolling instruction to one visible table caption; and
- moved the nightly basis into the row heading to remove repetitive price copy.

### E04-F04 — Reorient the stay comparison

[Feature record](../completed/e04-f04-reorient-the-stay-comparison.md)

- made each standard stay a table row rather than a column;
- replaced the feature row headings with compact icon-and-label column headings;
- kept the Stay column fixed whenever the remaining columns scroll; and
- removed the visible sideways-swiping instruction.

### E04-F05 — Move Quick Check into the mobile booking dock

[Feature record](../completed/e04-f05-move-quick-check-into-mobile-booking-dock.md)

- replaced the landing page's mobile booking link with compact date, guest and
  Quick Check controls;
- opened date, guest and result sheets upwards over the page content;
- closed completed date and guest selection automatically or through **Done**;
  and
- preserved the existing tablet and desktop Quick Check presentation.

### E04-F06 — Reposition and compact guest reviews

[Feature record](../completed/e04-f06-reposition-and-compact-guest-reviews.md)

- moved **What our guests say** directly after **Olrig Bank in pictures**;
- presented reviews as navigable groups of three compact cards;
- kept each group stacked on phones and arranged its cards in columns on wider
  screens; and
- renamed and condensed the Airbnb category-rating summary.

### E04-F07 — Expand and organise the home gallery

[Feature record](../completed/e04-f07-expand-and-organise-home-gallery.md)

- divided **Olrig Bank in pictures** into **Inside Olrig Bank** and **In the
  garden**;
- made all 18 main-house and 11 Cottage interior photographs available in the
  indoor gallery;
- made all 9 garden photographs available in the outdoor gallery; and
- gave each gallery independent navigation and a scoped full-screen viewer.

### E04-F08 — Unify the responsive landing page

[Feature record](../completed/e04-f08-unify-responsive-landing-page.md)

- removed the landing page's persistent desktop navigation sidebar;
- widened and centred the shared responsive content shell;
- unified homepage Quick Check across desktop and mobile presentations;
- harmonised reviews as an item-based responsive carousel showing one, two or
  three cards according to available width; and
- preserved the hero photograph with a compact, localised desktop copy panel.

## Epic constraints

- Keep Quick Check authoritative behaviour and continuation state unchanged.
- Obtain public base prices from enabled default-nightly rules in published
  pricing plans rather than duplicating values in content.
- Preserve semantic markup, keyboard access and touch usability.
- Contain narrow-screen comparison overflow within the table region.
- Verify every visual iteration against the deployed Docker application.

## Remaining work

Complete one final feature that adds permanent Playwright UI tests for the
finished responsive experience.
