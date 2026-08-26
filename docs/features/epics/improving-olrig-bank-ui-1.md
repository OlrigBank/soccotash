# Improving the Olrig Bank UI — Step 1

## Status

Proposed.

## Epic summary

Improve the first impression and first decision on the public Olrig Bank
website, particularly on a phone. This first step combines the three
highest-impact changes identified during the initial review:

1. replace the overflowing mobile navigation with a compact, intentional
   header and menu;
2. turn the homepage opening into an image-led hospitality hero with a clear
   route to requesting a stay; and
3. shorten the introductory journey so visitors reach **Ways to stay** quickly.

This is a focused improvement to the public presentation layer. It is not a
full redesign and must not change booking rules, accommodation definitions,
availability behaviour or persisted data.

## Problem

At phone widths the current header presents the main navigation as a horizontal
scrolling row. Important destinations can be off-screen, while a separate
**Explore Olrig Bank** disclosure appears beneath it. The two navigation
surfaces compete for attention and make the page opening feel like an
application shell rather than a welcoming accommodation website.

The homepage then opens with a beige text panel followed by another text panel.
Visitors must read several paragraphs before reaching the four accommodation
choices. The page explains the site before it shows the property, and the
primary action to request a stay does not have enough visual prominence.

The result is weakest on a phone, where the header and opening copy consume a
large proportion of the first screens. The property photograph, the core offer
and the next action should be understandable without prolonged scrolling.

## Desired outcome

A first-time visitor should be able to answer these questions within the first
two phone screens:

- What is Olrig Bank?
- Where is it?
- What should I do if I want to stay?
- What accommodation choices are available?

The opening should feel warm, photographic and specific to the property while
remaining fast, readable and usable with keyboard, touch and assistive
technology.

## Scope

### 1. Compact mobile header and navigation

At widths below the existing desktop breakpoint, provide one coherent header
containing:

- the Olrig Bank brand linked to the homepage;
- a prominent **Request a stay** action; and
- a clearly labelled menu control for all other public navigation.

The menu must replace the current horizontally scrolling link row and the
separate competing mobile navigation surface. It should expose the existing
public destinations without reproducing the complete desktop sidebar hierarchy
in the closed header.

The mobile menu must:

- use a native or equivalently accessible disclosure pattern;
- have an accessible name and visible open/closed state;
- be operable by keyboard and touch;
- keep interactive targets at least 44px where practical;
- show visible focus;
- avoid horizontal page overflow from 320px upwards; and
- remain useful when client-side JavaScript is unavailable.

Desktop navigation may retain its current broad information architecture, but
its visual treatment should align with the new header. This epic does not
restructure Local Guide categories or redesign the desktop sidebar.

### 2. Image-led homepage hero

Replace the homepage's generic panel hero with a photographic hero using the
candidate image:

```text
/media/images/spaces/house/View of front of house-no-cyclists-hero.jpg
```

The image is a separate 16:9 crop. The uncropped cyclist-free image and the
source photograph must remain available and unchanged.

The hero should include:

- one concise heading identifying Olrig Bank and Kendal;
- one short supporting sentence describing the accommodation proposition;
- a primary **Request a stay** action linking to `/book/`; and
- a secondary **View ways to stay** link that moves to the accommodation
  choices on the same page.

Suggested initial content:

```text
Stay together at Olrig Bank in Kendal

A welcoming Victorian house with flexible stays for families and groups,
within walking distance of Kendal and easy reach of the Lake District.
```

The final wording may be refined during visual review, but it must remain short
and must not imply instant booking or guaranteed availability.

The composition must keep the house legible at common phone and desktop aspect
ratios. Text placed over photography requires sufficient contrast across the
actual image, using a restrained overlay or a solid text surface where needed.
The hero must use responsive image sizing, avoid layout shift and provide
descriptive alternative text unless the implementation makes the image purely
decorative with the same information already expressed in adjacent text.

### 3. Shorter route to Ways to stay

Remove the standalone introductory prose panel from between the hero and the
accommodation choices. The hero should carry the essential proposition and the
**Ways to stay** section should follow it directly.

Retain only the minimum orientation needed to explain that there are four
choices:

- Olrig Bank;
- The Cottage at Olrig Bank;
- Olrig Bank Max; and
- Olrig Bank Bespoke.

Any retained introduction should be no more than two short sentences and
should sit with the **Ways to stay** heading rather than in a separate boxed
panel. The existing links to detailed listing pages remain in their cards.
Help choosing an option should be expressed as a concise link to Jenna rather
than another paragraph before the cards.

The section needs a stable fragment target so the hero's **View ways to stay**
link works without JavaScript.

## Responsive presentation

The homepage opening must be intentionally composed at, at minimum:

- 320px wide;
- 375px wide;
- 390px wide;
- 430px wide;
- tablet width around 768px; and
- a representative desktop width of 1280px or wider.

On phones, the first screen should show the brand, the hero's core proposition
and its primary action without horizontal scrolling. The **Ways to stay**
heading should be visible within, or close to, the second screen at a 390 × 844
viewport. This is a review target rather than a reason to reduce text below an
accessible or understandable size.

Image cropping may vary responsively through CSS positioning or `<picture>`
sources, but it must not hide the identity of the house or make overlaid text
unreadable.

## Visual direction

This step should establish a clearer hierarchy without replacing the site's
whole design system:

- let the photograph, rather than another beige container, dominate the opening;
- retain the existing cream-and-green identity;
- use darker, higher-contrast body text;
- reserve the strongest button treatment for **Request a stay**; and
- reduce nested panels and borders in the homepage opening.

Motion is not required. If any transition is introduced, it must respect
`prefers-reduced-motion` and must not be necessary to operate the navigation.

## Content and behaviour to preserve

- The public name **Olrig Bank** and the four agreed Ways to stay.
- The current `/book/`, listing, contact, guest-information and Local Guide
  routes.
- Server-rendered links to important public pages.
- Existing booking enquiry, availability and administrator-review behaviour.
- Existing canonical, social and search metadata unless the hero image is
  deliberately adopted as the homepage social image.
- The desktop sidebar on content pages unless a small compatibility adjustment
  is required by the new header.

## Out of scope

- Redesigning the accommodation cards or adding prices, calendars or new facts.
- Flattening or rewriting the Local Guide information architecture.
- A persistent bottom or sticky booking bar.
- Redesigning listing pages, booking forms, private booking pages or admin pages.
- New accommodation, pricing, availability or booking behaviour.
- Database schema or data migrations.
- A site-wide typography, colour or component-system replacement.
- Replacing or deleting the original property photographs.

These remain candidates for later UI steps after the new opening has been
reviewed with real content at phone and desktop widths.

## Acceptance criteria

1. At widths from 320px to the desktop breakpoint, no main-navigation item is
   hidden in a horizontally scrolling row.
2. The mobile header presents the brand, **Request a stay** and one accessible
   menu control without duplicating navigation surfaces.
3. Every existing top-level public navigation destination remains reachable.
4. Navigation is keyboard operable, has visible focus, exposes its state to
   assistive technology and works without relying on client-side JavaScript.
5. The homepage opens with the approved property hero image, a concise heading,
   one supporting sentence and primary and secondary actions.
6. **Request a stay** links to `/book/` and does not imply that a booking is
   immediately confirmed.
7. **View ways to stay** links to a stable fragment on the same page.
8. The standalone introductory prose panel is removed and **Ways to stay**
   follows the hero directly, with no more than two short orientation sentences.
9. The four accommodation options remain in the agreed order: Olrig Bank, The
   Cottage at Olrig Bank, Olrig Bank Max and Olrig Bank Bespoke.
10. Hero text meets WCAG AA contrast against the image in every supported layout.
11. The hero image retains a recognisable view of the house at the specified
    phone, tablet and desktop widths without distortion.
12. The changed pages have no document-level horizontal overflow at 320px,
    375px, 390px or 430px.
13. The homepage remains understandable and navigable when JavaScript is
    disabled.
14. Existing public routes, booking behaviour and desktop content-page
    navigation continue to work.
15. No database or migration file is changed.

## Proposed delivery slices

### Slice 1 — Header and mobile menu

Consolidate the public header and mobile navigation, preserve route access and
add focused accessibility and responsive regression coverage.

### Slice 2 — Homepage hero

Introduce the hero asset, responsive composition, concise copy and the two
actions. Verify image loading, contrast and cropping at target viewports.

### Slice 3 — Opening content reduction

Move the minimum useful orientation into the **Ways to stay** section, remove
the redundant prose panel and add the stable in-page target.

The slices may be delivered in one pull request if the combined change remains
easy to review. They should still be committed and tested as separable outcomes
so navigation defects do not become entangled with homepage copy decisions.

## Validation

- Run the project's Astro/type checks and production build.
- Run existing public-page and navigation tests plus focused tests for the new
  menu and in-page link.
- Review the homepage at all target widths using the local Docker deployment.
- Test the mobile menu with keyboard only and with JavaScript disabled.
- Check heading order, accessible names, focus indication and image alternative
  text in the rendered page.
- Check hero contrast using the final image and every responsive text position.
- Confirm the header and homepage produce no horizontal page overflow.
- Confirm all public navigation and four listing links resolve successfully.
- Confirm `db/` and migration files are unchanged.

## Evidence for completion

Completion should include:

- phone and desktop screenshots of the closed and open navigation;
- phone and desktop screenshots of the homepage opening;
- the viewport sizes used for review;
- automated check and build results;
- accessibility and JavaScript-disabled observations; and
- confirmation that booking behaviour and persisted data were not changed.
