# E09-F01 — Establish the Shared Public Design Foundation

## Status

Accepted after implementation and verification. Automated, build, deployed-HTML
and Chrome DevTools responsive checks pass.

## Parent epic

[`E09 — Harmonise the Public UI with the Landing Page`](epics/e09-f00-harmonise-the-public-ui-with-the-landing-page.md)

## Problem

The landing page already supplies the intended Olrig Bank colour palette,
compact navigation and responsive shell, but those conventions do not yet have
an explicit customer-facing boundary. `BaseLayout`, the private Booker layout
and administration pages all consume the large global stylesheet, while only
`BaseLayout` loads the green theme. Common buttons also use two secondary class
names, only one of which has a foundation rule.

Without a small shared foundation, later E09 features would either repeat
styles page by page or risk changing administration while trying to harmonise
customer journeys.

## Desired outcome

1. Public and private customer layouts explicitly opt into the same Olrig Bank
   public theme.
2. Administration remains outside that theme boundary.
3. Later features have reusable tokens for content width, reading measure,
   controls, surfaces and focus treatment.
4. Buttons, focus indicators, feedback notices and simple surfaces have stable
   public primitives.
5. No content-page, booking or reservation workflow is redesigned prematurely.

## Scope

- Mark `BaseLayout` and `BookerLayout` as customer-facing public UI roots.
- Load the established green theme in both customer layouts.
- Add reusable design tokens without replacing the existing token names.
- Establish consistent public focus treatment and inherited form typography.
- Strengthen the existing button primitive and support both established
  secondary-button class names.
- Add reusable surface, stack, eyebrow and status-notice primitives for later
  features.
- Provide a reusable visually-hidden text primitive and use it to expose valid
  accessible review-rating text.
- Add a focused source contract protecting the public/admin theme boundary and
  the new primitives.

## Explicit exclusions

- Removing or redesigning the persistent content-page sidebar.
- Restyling listings, Local Guide pages or general content; that is E09-F02.
- Changing booking, quotation or provisional-booking behaviour; that is
  E09-F03.
- Redesigning Booker, reservation or planning screens; those are E09-F04 and
  E09-F05.
- Applying the public green theme to `AdminLayout`.
- Changing persisted data, routes, metadata, authentication or authorisation.

## Administration dependency

Administration continues to import `global.css`, so existing unscoped legacy
rules remain shared. New E09 presentation rules that define the public identity
are scoped beneath `.public-ui`, and `AdminLayout` neither adopts that class nor
imports `green-theme.css`. Generic token additions are backwards-compatible
with the existing administration rules.

## Acceptance criteria

1. `BaseLayout` and `BookerLayout` mark their bodies with `.public-ui`.
2. Both customer layouts receive the established green theme.
3. `AdminLayout` receives neither the public root class nor the green-theme
   import.
4. Public focus indicators are visible and consistent for links, buttons,
   disclosures and form controls.
5. The shared button has a touch-sized minimum height and both existing
   secondary class names receive the same treatment.
6. Reusable public surfaces and success, warning and error notices do not rely
   on colour alone: their semantic meaning remains supplied by adjacent text
   and appropriate page markup.
7. Existing landing-page, mobile-shell, Booker and administration contracts
   pass.
8. The Astro project builds successfully.

## Verification plan

- Run the focused E09 foundation contract.
- Run the complete booking-lifecycle source-contract suite.
- Run `astro check` and the production build.
- Exercise representative public, Booker and administration pages in the
  running application when an interactive browser connection is available.
- Record any unavailable verification rather than treating it as passed.

## Completion evidence

- Added `.public-ui` to the ordinary public and private Booker layout roots.
- Loaded the established green theme for Booker pages while leaving
  `AdminLayout` outside the public theme boundary.
- Added reusable content, reading-width, control, surface and focus tokens.
- Added scoped public focus and form typography rules, reusable surfaces and
  semantic notice variants, and a consistent touch-sized button foundation.
- Corrected the existing secondary-button naming mismatch by supporting both
  `.button-secondary` and `.button--secondary`.
- Replaced a prohibited `aria-label` on landing-page review paragraphs with
  visually hidden rating text and decorative star glyphs.
- Added `e09-public-design-foundation.test.ts` to protect the customer/admin
  boundary and foundation contracts.
- The focused foundation, mobile UI, landing-page, Booker and administration
  contracts passed.
- The complete booking-lifecycle contract suite passed: 81 tests, 0 failures.
- `astro check` completed with 0 errors and 0 warnings. It reported one
  pre-existing hint for the unused `safeReturn` value in `admin/login.astro`.
- The production Astro build completed successfully locally and again within
  the Docker image build.
- The local Docker application was rebuilt, restarted and reached its healthy
  state.
- Deployed HTML smoke checks confirmed `.public-ui` on `/` and `/book/`, and
  confirmed that `/admin/login/` retains the separate `.admin-login-body`.
- Chrome DevTools inspected the landing page at 390×844, 768×1024 and 1440×900.
  Each viewport had no document-level horizontal overflow; the header and page
  shells remained within their intended widths and the green focus token was
  active.
- Chrome DevTools inspected `/book/` at 390×844. Form controls retained a
  44-pixel minimum height, inherited typography and a visible three-pixel green
  focus outline, with no horizontal overflow or console warnings or errors.
- Chrome DevTools confirmed `/admin/login/` retains the brown administration
  accent, has no `.public-ui` root and has no horizontal overflow at 390×844.
- The initial mobile Lighthouse run scored 96 for accessibility and identified
  one prohibited ARIA attribute on review-rating paragraphs. That defect was
  corrected; the repeated mobile audit scored 100 for accessibility, best
  practices, SEO and agentic browsing, with all 62 audits passing.
