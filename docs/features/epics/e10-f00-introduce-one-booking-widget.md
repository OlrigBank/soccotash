# E10 — Introduce one booking widget

## Status

In progress. E10-F01 is implemented on the shared `CompactBookingPanel`.
E10-F02 is implemented on `agent/e10-quick-check-entry-points`; owner acceptance
is pending. See its completion record below.

## Epic summary

Reuse the landing page's Quick Check presentation across public booking entry
points. Mobile pages use the mobile Quick Check dock; tablet and desktop pages
use the inline Quick Check panel. On accommodation listings, move the main
image to the top of the page content, below the public header. On tablet and
desktop, place Quick Check immediately beneath it, following the landing page.

## Starting point

The landing page already presents Quick Check beneath its hero image and uses
a dock on mobile. Listings share `CompactBookingPanel.astro`, but retain a
different Check a stay presentation. Some public mobile pages offer a bottom
Check availability action. `/book/` uses the separate full request form.

## Problem

Visitors encounter different booking entry controls across public pages.
Listings also separate the image and booking controls differently from the
landing page, making the same task feel inconsistent.

## Desired outcome

- On mobile, replace existing bottom Check availability actions with the mobile
  Quick Check dock and remove the inline Check a stay panel from that layout.
- On tablet and desktop, replace Check a stay with the landing page's Quick
  Check presentation, immediately below the main image.
- Preserve listing-specific arrangements, Bespoke enquiry behaviour and
  continuation into the existing full booking request.

## Experience boundary

Cover the landing page as the reference implementation, all four accommodation
listings, and other public pages that currently show the bottom mobile Check
availability action. Inventory those consumers before implementation and record
which routes change. Image repositioning applies to accommodation listings;
other public pages receive only the applicable booking-action replacement.

The full `/book/` form, private booking pages and administration workflows are
outside the replacement scope. This epic does not commit to replacing `/book/`.

## Design direction

Use the existing mobile breakpoint. The main listing image comes first below
the public header. Tablet and desktop then show Quick Check, followed by the
listing description and remaining content; replace the existing side-by-side
booking introduction where necessary. Preserve the page title, accessible
heading structure, image alternatives and existing listing content.

On mobile, retain the image-first listing introduction and expose booking via
the dock. Do not also display an inline booking panel. Reserve enough space for
the dock so that page content and footer actions remain reachable.

UI pattern names: image-first booking introduction (custom page layout pattern);
Quick Check panel (custom UI pattern); mobile Quick Check dock (custom responsive
UI pattern). Reuse the existing date range picker and Guests popover.

## Workflow and behaviour principles

- Share the presentation and interactions without coupling them to automatic
  stay selection: listings keep their arrangement fixed, while the landing
  page and generic public dock can find a suitable stay.
- Preserve adults, children, infants, pets and dates across responsive layout
  changes and continuation to `/book/`, without re-entry.
- Expose exactly one booking entry control per responsive layout; hidden
  controls must not remain keyboard-accessible.
- Preserve Bespoke enquiry wording and preferred dates without implying an
  immediate availability result, price or reservation hold.
- Keep availability and pricing authoritative on the server. Editing stay
  inputs invalidates the checked result; continuation and submission retain
  existing revalidation and conflict handling.
- Keep detailed pet information, contact capture and request submission in the
  existing full booking form.

## Feature sequence

### E10-F01 — Floating date and guest capture controls

Create a compact booking widget in which the Check-in and Check-out display
opens a floating calendar positioned below the date fields. The calendar
supports arrival-then-departure selection, closes automatically when both dates
are selected, and leaves the selected date range visible in the display.

The read-only Guests field opens a separate guest-selection pop-up. Opening
either pop-up closes the other, so only one transient panel is visible at a
time. The layout must remain readable and usable at narrow mobile widths
without truncating the date labels or selected values.

#### E10-F01 implementation record

- The landing page and listing booking flows use `CompactBookingPanel.astro` as
  the shared implementation. `/book/` remains a separate full booking flow
  and is outside this epic's replacement scope.
- Check-in and Check-out use a floating calendar below the date display on
  desktop and a responsive sheet on the mobile dock. Arrival is selected first;
  departure observes the minimum stay and the calendar closes after both dates
  are selected.
- Guests uses a read-only summary with a separate pop-up. Opening the date or
  guest control closes the other transient panel.
- Quick Check results show Total followed by Stay. The action changes from
  `Quick Check` to `Book`; the reassurance line is inline and empty until a
  result is available.
- Stay names match the landing-page stay table. The selected Stay links to its
  listing page and carries the checked dates and guest counts so the listing
  booking controls are prepopulated.
- The responsive dock keeps the date, guest, total and stay controls in the
  same compact grid and avoids document-level horizontal overflow.

UI pattern names: Quick Check panel (custom UI pattern); mobile Quick Check
dock (custom responsive layout pattern); date range picker (custom pattern);
Guests popover (custom pattern using native `<details>`); Stay link (custom
result presentation using a native link); Total field (custom result field);
Quick Check/Book action (custom stateful control using a native button).



### E10-F02 — Shared Quick Check entry points and image-first listings

1. Inventory public bottom Check availability actions and listing booking
   panels, including standard and Bespoke consumers.
2. Reuse the landing page's Quick Check presentation for fixed-arrangement
   listings, preserving their booking behaviour.
3. Replace bottom mobile Check availability actions with the mobile Quick Check
   dock and remove inline Check a stay panels from the mobile layout.
4. Move each listing's main image to the top of its page content. On tablet and
   desktop, place the inline Quick Check panel immediately beneath the image,
   before the description and remaining listing content.
5. Verify responsive state preservation, accessibility and continuation, and
   record route coverage and completion evidence before acceptance.

## Delivery process

Follow the same iterative and incremental process used by the docs/features/epics/completed/e09-f00-harmonise-the-public-ui-with-the-landing-page.md

1. Develop or update unit tests during development iterations
2. deploy and visually exercise the updated local application, including important
   success, empty, error and continuation states;
3. record completion evidence, limitations and any change proposed to the
   remaining sequence; and
4. obtain acceptance before beginning the next feature.

Visual changes must be assessed in context rather than accepted solely from
component tests or static markup inspection. Changes to a workflow require
end-to-end verification of the persisted result and safe resumption, not only
confirmation that the screen renders.

## Cross-cutting requirements

- Use British English in documentation, interface copy, test descriptions and
  new identifiers where ordinary words form part of the identifier.
- Preserve canonical URLs, redirects, fragments and indexed content unless a
  feature explicitly documents an approved change.
- Do not expose customer, booking, reservation, message or planning data to an
  unauthorised user, public payload, log, analytics event or search index.
- Keep server-side availability, price calculation, booking state and role
  permissions authoritative.
- Render user-provided content safely and do not introduce unsanitised HTML.
- Do not communicate meaning through colour, position or icons alone.
- Support keyboard and touch use, visible focus, semantic landmarks, useful
  accessible names and reduced-motion preferences.
- Prevent document-level horizontal overflow from 320px upwards.
- Avoid avoidable layout shift and oversized media downloads.
- Retain useful progressive enhancement and server-rendered fallbacks where
  practical.
- Verify shared changes against both their customer-facing and administration
  consumers.
- Avoid one-off page styling when a stable shared pattern expresses the same
  purpose.

## Epic acceptance criteria

1. Every inventoried public bottom mobile Check availability action is replaced
   by the mobile Quick Check dock.
2. Mobile listings expose the dock without an inline Check a stay panel; only
   the active responsive booking control is visible and keyboard-accessible.
3. Tablet and desktop listings use the landing page's Quick Check presentation
   immediately beneath the main image, before the listing description.
4. The main listing image is at the top of page content below the public header,
   with page title, accessible structure and existing content preserved.
5. Listings retain their fixed stay arrangement. Landing-page and generic dock
   stay selection continues to work, and Bespoke remains an honest enquiry.
6. Dates and all guest/pet counts survive responsive changes and continuation
   into `/book/` without re-entry. Following the checked Stay link to a listing
   also preserves Total, Stay, reassurance/guidance and the Book action.
7. Changed inputs invalidate checked results. Availability, pricing, occupancy,
   request creation and changed-quote protections retain server authority.
8. The dock does not obscure content or footer actions. Changed layouts have no
   document-level horizontal overflow from 320px upwards.
9. Keyboard and touch operation, visible focus, accessible names, pop-up
   dismissal and focus return work across phone, tablet and desktop layouts.
10. Permanent browser coverage protects the responsive controls and important
    continuation paths; focused booking regressions pass.
11. Every feature has an accepted record and completion evidence before the
    epic is marked complete. New copy and documentation use British English.

## Completion evidence

### E10-F01

- Focused booking lifecycle tests passed: 3 tests covering the shared panel,
  date range calendar and mobile Quick Check dock.
- `npm run build` passed, and the Docker image was rebuilt with `astro check`
  reporting 0 errors.
- Chrome DevTools inspected the rebuilt local application at desktop and mobile
  settings. The landing page had no console errors and its document and asset
  requests returned HTTP 200. A listing URL carrying checked dates and guest
  counts populated the listing booking controls with those values.
- Lighthouse mobile audit passed all reported categories at 100, with no failed
  audits. The earlier desktop audit recorded Accessibility 96, Best Practices
  100 and SEO 100; its two failures were existing accessibility-tree findings
  outside this feature's scope.
- The LAN HTTPS address was not used for this verification because the current
  DHCP address did not route to the container; verification used the rebuilt
  local Docker HTTP service instead.

### E10-F02

Implemented on the task branch; awaiting owner acceptance.

- All four listings (`/listings/olrig-bank/`, `/listings/cottage/`,
  `/listings/event/`, `/listings/bespoke/`) now put their main image first, with
  the inline Quick Check panel immediately beneath it at 700px and wider.
  The description, page heading and remaining content follow.
- Below 700px, the same panel becomes the mobile dock. There is one form per
  listing, so dates and party selections survive layout changes without copying
  state between hidden forms. Listings retain their configured arrangement.
- The shared public shell replaces its bottom mobile action with a generic dock
  on `/listings/`, `/contact/`, `/guest-information/`, `/local-guide/`, Local
  Guide detail routes, published `/holiday-plans/[slug]/` pages and the 404
  page. The landing page retains its existing Quick Check with shared dock
  positioning. `/book/` remains unchanged, and administration previews retain
  their existing bottom action.
- Compact presentation is independent of automatic stay selection. Fixed
  listings, generic stay selection and Bespoke use the same date and guest
  controls. Bespoke bypasses availability and quote calls and keeps its enquiry
  wording. Host-priced requests retain a continuation link and explanation.
- Quoted results show Total and Stay, preserve server-provided guidance and
  make Book continue to `/book/` with the selections. Changes invalidate the
  checked result; late responses cannot restore an obsolete quote.
- Corrected result/guest group semantics, guest input names, desktop Escape
  focus return, mobile backdrop display and result visibility after a resize.
  The dock's measured height reserves space for both footer content and sheets,
  including wrapped guest summaries and displayed results. A no-JavaScript
  link preserves a route into the full request form.
- Invalid transferred dates/counts are ignored; a departure that violates the
  listing's minimum stay clears both the stored value and its visible label.

UI pattern names: **image-first booking introduction** (custom page layout);
**Quick Check panel** (custom UI pattern); **mobile Quick Check dock** (custom
responsive layout); **date range picker** (custom control); **Guests popover**
(custom pattern using native `<details>`); **mobile selection/result sheet**
(custom modal pattern).

Verification and limitations:

- The complete booking-lifecycle command passed 85 checks. Docker's production
  build passed with `astro check` reporting 0 errors, 0 warnings and two existing
  hints in administration files.
- `npm run test:public-experience-regression -- --workers=4` passed 61 browser
  checks; three desktop-only hero checks were appropriately skipped on smaller
  viewports. Playwright coverage in `tests/landing-page-regression/quick-check.spec.ts`
  exercises all four listings, generic pages, fixed arrangements, automatic
  selection, Bespoke, validation, unavailable/host-priced/network-error states,
  quote invalidation, stale responses, transferred state and `/book/`
  continuation. It also checks server guidance and invalid query parameters.
- Browser projects use 320×800, 390×844, 768×1024 and 1440×900; responsive tests
  additionally cross 699px/700px and exercise a 1024px layout. Success tests
  verify footer clearance with results shown.
- Chrome DevTools inspected the rebuilt local Docker service on port 8080 at
  320×800, 768×1024 and 1440×900. Checked image/panel order, document and sheet
  overflow, date/guest controls, keyboard focus, Escape dismissal, transferred
  selections, successful quoted results and recoverable errors. No document
  overflow or unexpected console errors were found; inspected document and
  asset requests returned HTTP 200.
- Lighthouse navigation audits of the Cottage listing (desktop and mobile)
  and Contact (mobile) scored 100 for accessibility, best practices, SEO and
  agentic browsing, with no failures. The first desktop audit exposed a labelled
  generic result container; giving it a valid group role corrected both related
  audit failures. These audits do not measure performance.
- Browser quote/availability scenarios use local response fixtures. No request
  was submitted, no private customer data was used and no customer was contacted.
  Persisted request creation and live availability were not exercised by these
  browser tests; server/domain behaviour is unchanged. Administration preview
  routes were source-reviewed rather than opened with a real private link.
- Screenshots and Lighthouse reports are available in `/tmp/e10-*` in the local
  verification environment. Automated scenarios remain in the repository for
  repeatable coverage.

### E10-F02 follow-up — Complete checked-result continuation

Following the landing page's checked Stay link now restores the complete Quick
Check panel on the selected listing: both dates, adults, children, infants,
pets, Total, Stay, reassurance, server guidance and the Book action. Host-priced
estimates retain their total and explanation on the listing too.

UI pattern name: **Checked Quick Check continuation** (custom state-transfer
pattern using the browser's native session storage).

The saved display result is matched to the complete selection and fixed listing
arrangement, and expires after 15 minutes. It contains only provisional quote
and non-contact selection data. Prices are not added to the URL or trusted by
the booking APIs. If storage is unavailable, missing, malformed, expired or for
a different selection, the marked Stay link triggers a fresh availability and
price check automatically. Unavailable dates then remove the former Total and
Book state. Editing the restored inputs still invalidates the result; `/book/`
and final submission retain server revalidation.

Verification:

- Docker production build passed; `astro check` reported 0 errors and 0 warnings.
- All 85 booking lifecycle checks passed.
- The public-experience Playwright suite passed 89 checks, with the three
  desktop-only hero checks skipped at smaller widths. New coverage compares
  every displayed field before/after navigation, verifies no duplicate check
  for a recent matching result, and verifies the fresh server check on `/book/`.
  It covers expired, missing, mismatched, malformed and disabled storage,
  host-priced estimates, subsequent edits and newly unavailable dates.
- Chrome DevTools inspected the rebuilt local app at 320×800, 768×1024 and
  1440×900. A local fixture carried the exact £1,234.00 total, four guest/pet
  counts, dates, Stay, reassurance and Book action from landing page to listing,
  without another availability/quote request. The restored mobile controls
  retained visible keyboard focus and Escape dismissal. No document overflow
  or console warnings/errors were found.
- Desktop and mobile Lighthouse snapshot audits of the restored result scored
  100 in every reported category with no failures. Screenshots and reports are
  in `/tmp/e10-continuation-*` in the verification environment.
- Browser availability/pricing responses were local fixtures. No booking was
  created and no customer was contacted; persisted request creation remains
  outside these browser checks.

## Verification plan

- Run applicable booking lifecycle contracts and repeatable Playwright coverage
  for fixed listings, generic selection, Bespoke and continuation to `/book/`.
- Build and inspect the rebuilt running application with Chrome DevTools at
  representative phone, tablet and desktop widths, including 320px and either
  side of the existing mobile breakpoint. Record exact dimensions and routes.
- Exercise initial, selected, available, unavailable, host-priced, Bespoke,
  validation, network-failure and continuation states, plus layout changes
  with dates and guest/pet counts already entered.
- Inspect image/panel order, document and intentional local overflow, dock
  clearance, keyboard operation, focus, accessible names and structure,
  console errors and relevant network behaviour.
- Run Lighthouse on the changed layouts, investigate applicable failures,
  correct regressions and repeat after corrections. Pair audit results with
  task-level browser evidence; identify any deferred findings explicitly.
- Use disposable local fixtures or non-notifying previews for request checks.
  Record any limitation without exposing credentials or contacting customers.


## Out of scope

- Replacing or redesigning the full `/book/` request form.
- A general redesign of `/admin/*` pages or administration workflows.
- Changing accommodation definitions, occupancy rules, pricing policy or the
  source of authoritative availability.
- Replacing the booking, reservation or planning domain models solely to make
  a visual change easier.
- Weakening private-link access, administrator access or role boundaries.
- Adding a new payment provider, communication channel or third-party booking
  platform unless separately approved.
- Rewriting Local Guide content or restructuring its taxonomy solely for visual
  consistency.
- Manufacturing new property claims, reviews, availability or prices.
- Applying one identical page composition to every type of customer task.
