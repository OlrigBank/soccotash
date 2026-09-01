# E04 — Rapid Cleanup of the Landing Page

## Status

Active.

## Epic summary

Improve the public landing page through short, independently documented and
tested iterations. Prioritise clear accommodation decisions, concise property
copy and responsive presentation while preserving the established Quick Check,
availability, pricing and booking-continuation behavior.

Each iteration is developed on a dedicated feature branch and may include
several local Docker deployments. A final dedicated iteration will add durable
Playwright UI coverage for the completed landing-page experience.

## Completed iterations

### E04-F01 — Prioritise and compare Ways to Stay

[Feature record](../e04-f01-prioritise-and-compare-ways-to-stay.md)

- promoted the stronger exterior photograph into the hero;
- moved the stay choices before the photo gallery;
- removed the repeated Ways-to-stay image; and
- introduced an accessible, horizontally scrollable comparison table.

### E04-F02 — Refine landing copy and show base prices

[Feature record](../e04-f02-refine-landing-copy-and-show-base-prices.md)

- repositioned the hero around Olrig Bank's secluded central location;
- renamed the comparison section **Choosing your stay**; and
- added published, database-backed base nightly prices with a safe fallback.

### E04-F03 — Tighten history and comparison labels

[Feature record](../e04-f03-tighten-history-and-comparison-labels.md)

- consolidated the property history and location proposition in the hero;
- reduced the scrolling instruction to one visible table caption; and
- moved the nightly basis into the row heading to remove repetitive price copy.

### E04-F04 — Reorient the stay comparison

[Feature record](../e04-f04-reorient-the-stay-comparison.md)

- made each standard stay a table row rather than a column;
- replaced the feature row headings with compact icon-and-label column headings;
- kept the Stay column fixed whenever the remaining columns scroll; and
- removed the visible sideways-swiping instruction.

### E04-F05 — Move Quick Check into the mobile booking dock

[Feature record](../e04-f05-move-quick-check-into-mobile-booking-dock.md)

- replaced the landing page's mobile booking link with compact date, guest and
  Quick Check controls;
- opened date, guest and result sheets upwards over the page content;
- closed completed date and guest selection automatically or through **Done**;
  and
- preserved the existing tablet and desktop Quick Check presentation.

### E04-F06 — Reposition and compact guest reviews

[Feature record](../e04-f06-reposition-and-compact-guest-reviews.md)

- moved **What our guests say** directly after **Olrig Bank in pictures**;
- presented reviews as navigable groups of three compact cards;
- kept each group stacked on phones and arranged its cards in columns on wider
  screens; and
- renamed and condensed the Airbnb category-rating summary.

## Epic constraints

- Keep Quick Check authoritative behaviour and continuation state unchanged.
- Obtain public base prices from enabled default-nightly rules in published
  pricing plans rather than duplicating values in content.
- Preserve semantic markup, keyboard access and touch usability.
- Contain narrow-screen comparison overflow within the table region.
- Verify every visual iteration against the deployed Docker application.

## Remaining work

Continue further agreed landing-page iterations, then complete one final
feature that adds permanent Playwright UI tests for the finished responsive
experience.
