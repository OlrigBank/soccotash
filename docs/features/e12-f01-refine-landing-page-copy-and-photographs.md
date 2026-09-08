# E12-F01 — Refine landing-page copy and photographs

## Status

Implemented and locally verified on 8 September 2026 on
`agent/e12-f01-refine-landing-page`. Awaiting owner review; not merged or deployed
to a hosted environment.

Part of [E12 — Quick cosmetic refinements](epics/e12-f00-quick-cosmetic-refinements.md).

## Result

The opening panel now begins with the property facts rather than a visible
Olrig Bank heading. Its single H1 remains available to assistive technology,
using the shared visually hidden utility without visible heading spacing.

Approved facts:

> Secluded Victorian Home | Ideal for medium to large groups | Dog friendly | Large garden | Ample parking

Approved introduction:

> Built in 1879 as a family home for George MacKay, a Mayor of Kendal and owner of the nearby Aynam Mills. Today, this spacious yet cosy house provides guests a comfortable base from which to explore Kendal on foot and easy access to everything the beautiful Lake District and Cumbrian peninsulas have to offer.

Approved group-fit copy:

> Olrig Bank offers medium to large parties of guests, who wish to have leisurely quality time together.

Fresh landing-page Quick Check selections start at six adults and zero children,
infants and pets. The shared panel accepts an optional `defaultAdults` property,
which defaults to two. Its rendered input defaults also drive client
initialisation. Explicit query values and existing saved selections retain their
precedence; direct Cottage and booking-page entry retain two adults.

**Inside the house** replaces **Inside Olrig Bank**. The gallery retains the
first existing photograph of each room or space in its previous order: ten
main-house and nine Cottage photographs. The garden retains only
`fb82fcb3-02ad-482b-8ec0-72e4959303d2.jpeg`, showing seating and the greenhouse.
Single-image collections omit navigation arrows, counters and the redundant
rail tab stop. The garden image still opens in the keyboard-accessible viewer.
Original assets and other pages' inventories remain available.

## UI pattern names

| Name | Type | Behaviour |
| --- | --- | --- |
| Landing-page introduction | Custom | Responsive image and copy panel with a visually hidden H1. |
| Quick Check guest selector | Existing custom pattern using native details/summary and inputs | Landing-page default of six adults; explicit and saved choices persist. |
| Curated photo gallery | Custom pattern using a native dialog | One view per room; single garden image; keyboard opening, navigation, dismissal and focus return. |

## Verification

- Rebuilt and restarted the local Docker site at `http://127.0.0.1:8080`.
  The build runs Astro check and a production build: zero errors or warnings,
  with two pre-existing hints in unrelated admin files.
- Focused hero and gallery contract checks passed. The full
  `npm run test:booking-lifecycle` suite passed all 86 test files.
- `npm run test:landing-page-regression -- --workers=4`: **209 passed,
  3 skipped**. The skipped checks are desktop hero geometry checks at smaller
  widths. Projects cover 320×800, 390×844, 768×1024 and 1440×900.
- Added permanent browser coverage for exact copy, the visually hidden H1,
  19 distinct room images, the selected garden image, viewer controls and
  keyboard focus return, six-adult quote/continuation, saved/query selection
  precedence and direct-entry defaults.
- Existing regression coverage also passed for empty inputs, unavailable dates,
  host-priced results, network errors, invalid counts, capacity limits, mobile
  sheets, calendar behaviour and booking continuation.
- Chrome DevTools inspection of the rebuilt site used actual emulated viewports
  of 390×844, 768×1024 and 1440×900. Verified readable wrapping, no document
  overflow, intentional table/interior-rail overflow, heading structure, control
  names, visible focus, viewer opening, arrow navigation, Escape dismissal and
  focus return. Initial window resizing was clamped to 500px by Chrome; phone
  evidence was captured only after switching to device emulation at 390px.
- Interactively exercised empty-date validation and a disposable quote fixture:
  six adults selected the main house and the **Book** action transferred six
  adults into `/book/`. No booking was submitted and no customer was contacted.
  Fixtures verify UI behaviour, not live prices or availability.
- No console errors or warnings were observed during landing-page inspection;
  the document loaded successfully. Automated coverage also checks browser
  faults and quote request payloads.
- Mobile and desktop Lighthouse navigation audits: **accessibility 96,
  best practices 100, SEO 100, agentic browsing 100**. The sole failure is the
  existing shared footer paragraph contrast, 2.4:1 (`#64726b` on `#2f373a`),
  already recorded in E11. The unchanged footer is outside F01. No audit
  regression was found. This DevTools audit does not include performance.
- `git diff --check` passed. The pre-existing deletion of
  `site/.astro/collections/localGuide.schema.json` was left untouched and is not
  included in this feature.

## Evidence

- [Phone, 390×844](evidence/e12-f01/phone-390x844.png)
- [Tablet, 768×1024](evidence/e12-f01/tablet-768x1024.png)
- [Desktop, 1440×900](evidence/e12-f01/desktop-1440x900.png)
- [Lighthouse scores and findings](evidence/e12-f01/lighthouse-summary.json)

Full local audit reports are in `/tmp/e12-lighthouse-mobile/` and
`/tmp/e12-lighthouse-desktop/`. The Playwright report is in
`playwright-report/landing-page-regression/`.
