# Feature 1 — Compact Public Mobile Header

## Parent epic

[Improving the Olrig Bank UI — Step 1](./epics/improving-olrig-bank-ui-1.md)

## Objective

Replace the horizontally scrolling phone navigation and separate Explore panel
with one compact header containing the Olrig Bank brand, a persistent request
action and an accessible menu for the remaining public destinations.

## Scope

- Use a native disclosure so the menu works without client JavaScript.
- Link to Home, Ways to stay, Guest information, Local guide and Contact.
- Keep Request a stay visible outside the disclosure.
- Preserve the desktop navigation and content sidebar.
- Indicate the current public destination where applicable.
- Prevent header-driven horizontal overflow from 320px upwards.

## Acceptance criteria

1. Phone layouts show the brand, Request a stay and one Menu control.
2. The old scrolling navigation and separate mobile Explore panel are absent.
3. All existing top-level public destinations remain ordinary links.
4. The disclosure is keyboard and touch operable, visibly focused and usable
   without JavaScript.
5. Interactive controls meet the 44px touch-target goal.
6. Desktop navigation and sidebar behaviour do not regress.

## Validation

- Public mobile navigation contract tests.
- Astro check and production build.
- Browser review at 320px, 375px, 390px, 430px and desktop width.

