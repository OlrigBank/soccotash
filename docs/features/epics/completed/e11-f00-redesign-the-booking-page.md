# E11 — Redesign the booking page

## Status

Completed and closed with owner approval on 9 September 2026. E11-F01 and
E11-F02 were accepted and closed on 8 September; E11-F03 is accepted and closed
by the owner's instruction to close this epic and its associated features.
F01 and F02 are recorded below; F03 has a separate
[completed feature record](../../completed/e11-f03-verify-bookers-and-private-accounts.md).
No further features remain in E11.

## Epic summary

Follow [E10 — Introduce one booking widget](../e10-f00-introduce-one-booking-widget.md)
by bringing the shared booking panel into `/book/`. Simplify the request journey
and remove duplicate stay selection, availability checking and pricing controls.
F01 delivered the shared panel and calendar. F02 added booker-detail collection
and an explicit review step. F03 added contact verification and private account
access. All three features are accepted and closed.

## Starting point

Before F01, public entry points shared `CompactBookingPanel.astro`, with
persistent selection and provisional results. `/book/` used
`BookingCalendar.astro`, which separately
implemented Choose, Check and Request steps. Its calendar already showed blocked
dates; the compact calendar showed one month without availability markings.

## Problem

Visitors arriving with a selected stay face another large selection form before
seeing the price and request details. Separate calendar implementations diverge
in presentation and behaviour. The compact calendar cannot show which nights
are already booked or blocked for the chosen arrangement.

## Desired outcome

- One shared stay, date, guest and provisional-price experience across public
  entry points and the booking page.
- Two visible calendar months and arrangement-specific unavailable dates in
  every use of the shared panel.
- An inline booking-page panel that continues directly to request details.
- Preserved selection, pet information, contact capture and safe submission.

## Experience boundary

F01 replaces the booking page's selection and duplicate checking controls and
updates the shared calendar everywhere it is consumed: the landing page, all
four accommodation listings, generic public entry points and `/book/`.
Other public pages keep their existing inline/dock placement. Private booking
pages and administration workflows are not being redesigned.

## Design direction

Keep the compact panel inline when editing a stay on `/book/` at every width.
F01 introduced shared checking and request details. F02 presents three stages:
**Check your stay**, **Collect Booker detail**, and **Review and send request**.
The panel owns checking and provisional pricing. Its Book action opens details;
a previously checked arrival opens details immediately during a fresh check.
Details and review show a stay summary with Edit stay.

Show two calendar months side by side when space permits and stack them on
narrow screens. Open at the selected arrival month and its following month;
without an arrival, open at the current month and next. Navigate one month at a
time. Retain existing date pop-up and mobile sheet interactions elsewhere.

UI pattern names: **Inline booking request panel**, **Two-month availability
picker** and **Request-details continuation** (custom patterns using native
controls); **Stay selector** (native select). Existing Guests popover and mobile
Quick Check dock remain shared patterns.

## Workflow and behaviour principles

- Preserve explicit URL selection precedence and E10's session persistence.
  `/book/` freshly checks incoming selections; saved totals are never authoritative.
- For a specific standard arrangement, fetch public availability for the visible
  months and selected range. Refresh on arrangement/month changes and ignore
  obsolete responses. Do not expose reservation or customer details.
- Prevent unavailable arrivals and ranges crossing blocked nights. Permit
  departure on the first blocked day when preceding nights are available and
  minimum-night rules are met. Explain availability without relying on colour.
- Preserve selected dates if refreshed availability conflicts with them, explain
  the conflict and invalidate the checked result.
- Show loading, refresh-warning and retry states. Failed requests must not
  represent unknown dates as confirmed available.
- Find a suitable stay retains neutral date selection until an arrangement is
  resolved. Bespoke captures preferred dates without checking or implying
  confirmed availability or a reservation hold.
- Editing the selection invalidates the reviewed quote and prevents submission
  until rechecked. Preserve contact and applicable pet details while rechecking.
- Retain server-authoritative availability, pricing, occupancy, changed-price
  protection, conflict handling and request creation.

## Feature sequence

### E11-F01 — Shared booking panel and availability calendar

**Status: accepted and closed — 8 September 2026.** All six implementation
steps below are delivered; verification and limitations are recorded under
Completion evidence.

1. Add two-month availability rendering to `CompactBookingPanel.astro` for all
   consumers, including selected dates, unavailable dates, valid departure
   boundaries, minimum stays, loading and recovery states.
2. Replace the booking page's Step 1 controls with the shared panel, inline at
   every width. Remove the separate Step 2 availability check and quote.
3. Add an explicit booking-page integration mode and typed selection/check-result
   hand-off. Avoid nested forms and duplicate editable stay inputs. Elsewhere,
   Book retains its existing navigation to `/book/`.
4. On `/book/`, Book continues to request details with appropriate focus. Retain
   contact, optional WhatsApp consent, message and submission. Move detailed pet
   questions here, showing them only when pets are present.
5. Update progress to Check your stay and Send your request; preserve incoming
   selections and require fresh validation before creating a request.
6. Add permanent regression coverage and record rebuilt-app verification before
   owner acceptance.

### E11-F02 — Collect booker details and review the request

**Status: accepted and closed — 8 September 2026.** F01 remains accepted and closed.

- Use three steps: **Check your stay**, **Collect Booker detail**, and
  **Review and send request**.
- A matching checked session or explicit successful continuation marker opens
  step 2 immediately while fresh checks run. Ordinary date links start at step 1.
  Navigation intent never authorises a price or availability claim.
- Show a stay summary with Edit stay above details. Preserve answers through
  editing, retries and conflicts; require fresh checks before final review.
- Collect name, email and Mobile number first, followed by optional WhatsApp
  consent, applicable pet questions, optional promo code and optional message.
  Retain existing contact validation: a name and at least one contact method.
- Review all supplied details and the current price in step 3, with Edit stay,
  Edit details and Request booking actions. Retain explicit changed-price review
  and safe private-page continuation.
- Store a trimmed, case-preserving optional promo code (maximum 80 characters)
  separately from the message and display it in host booking details. No code
  validation against campaigns or automatic discount is introduced. Explain:
  “Jenna will review your code. No discount has been applied to this total.”
- Verify entry rules, check failures, editing, validation, promo persistence,
  host visibility and submission using permanent tests and non-notifying local
  fixtures. Rebuild and inspect phone, tablet and desktop with Chrome DevTools
  and Lighthouse before recording completion for owner acceptance.

UI patterns: **Booking step navigation**, **Stay summary with edit** and
**Request review** are custom patterns. **Booker details form** uses native
form controls.

### E11-F03 — Verify bookers and introduce private accounts

**Status: accepted and closed — 9 September 2026.**

See the [feature record](../../completed/e11-f03-verify-bookers-and-private-accounts.md) for the
agreed flow, migration, configuration, security boundaries and verification.
Require email or SMS verification before review; link successful requests to
accounts with opaque server-side sessions; provide header return access and
passwordless sign-in. Replace bearer-link authorisation throughout the private
booking workflow while retaining its existing page design. Existing bookings
become claimable through email-first contact verification.

No further features are planned in this closed epic. Uncommitted ideas from the
initial review include
broader contact-form styling, copy refinement, footer contrast and further
page-layout changes. F01 corrects display/accessibility issues required by the
replacement and moved controls, without expanding into a general redesign.

## Delivery process

Follow E10's iterative and incremental delivery process:

1. Develop focused automated coverage with the implementation.
2. Build and exercise the local application, including success, empty,
   validation, error and continuation states.
3. Verify persisted request creation and safe resumption using disposable,
   non-notifying fixtures; record any limitation.
4. Record completion evidence and proposed changes to the remaining sequence.
5. Obtain owner acceptance before beginning the next feature.

## Cross-cutting requirements

- Use British English in interface copy, documentation and tests.
- Preserve canonical routes and public content unless explicitly changed here.
- Keep private customer, reservation and contact information out of public
  availability responses, analytics, logs and test artefacts.
- Keep server-side business rules and role permissions authoritative; safely
  render all user-provided content.
- Support keyboard/touch operation, visible focus, meaningful accessible names,
  selected-state announcements, dismissal and focus return.
- Avoid document overflow from 320px upwards and preserve intentional local
  scrolling, reduced-motion preferences and useful fallbacks where practical.
- Reuse shared patterns rather than maintaining a second booking widget.

## Epic acceptance criteria

1. `/book/` uses the shared compact panel inline at all widths, with one owner
   of stay inputs, availability checking and provisional pricing.
2. Every shared calendar displays two consecutive months and correctly shows
   blocked nights for the selected standard arrangement.
3. Range selection honours minimum nights and departure boundaries, preserves
   keyboard focus and communicates selected/unavailable states accessibly.
4. Loading, unavailable, network failure, refresh warning, stale-response,
   automatic-selection and Bespoke states are honest and recoverable.
5. Book continues within `/book/`; other consumers retain their continuation.
   Details and applicable pet answers survive edits and rechecking.
6. Incoming selection transfer and fresh checking work; request submission
   retains server-authoritative pricing, conflicts and private-page continuation.
7. Applicable automated checks, DevTools inspection and Lighthouse evidence are
   recorded. F01 has owner acceptance before the next feature is defined.
8. The epic is not marked complete until subsequently agreed features have
   their own accepted completion records.

## Completion evidence

### E11-F01

Implemented and accepted on 8 September 2026. Closed by the owner's explicit
confirmation after pushing the work to date. Implementation commit: `ed18eaf`
on `agent/e11-redesign-booking-page`.

- `/book/` embeds the shared compact panel inline at every width. It freshly
  checks incoming selections, presents the provisional total and continues
  through Book to the request-details form without navigation or nested forms.
  The duplicate calendar, party controls and separate price-check step are gone.
- The shared picker renders two consecutive months, selected arrival/departure
  announcements and unavailable-night hatching. Visible-range requests include
  the selected range, allowing correct boundary departures and preventing stays
  crossing blocks. Arrangement/month changes discard obsolete responses;
  automatic selection refreshes an already open neutral calendar.
- Contact and applicable pet answers survive editing and rechecking. Zero pets
  hides the pet section. Contact validation, request failure recovery, changed
  price review and server-returned private-page continuation are retained.
- Calendar updates retain keyboard focus. Escape closes the inline picker even
  when focus is still on its trigger. The calendar has bounded internal scrolling
  to avoid creating a second page scrollbar. The existing public-shell Chromium
  repaint workaround is preserved.
- Booking-page integration uses typed selection/quote state and local panel
  continuation/invalidation events. No booking API, schema, pricing or occupancy
  policy was changed. The booking-page Stay selector is native; existing entry
  point Stay controls retain their behaviour.

UI pattern names: **Inline booking request panel**, **Two-month availability
picker** and **Request-details continuation** are custom patterns. **Request
details form** uses native fields/fieldsets with conditional pet sections;
**Price details disclosure** uses native `<details>`; **WhatsApp consent row**
uses a native checkbox with a custom aligned layout.

Verification:

- Local Docker production build passed; Astro reported 0 errors, 0 warnings and
  two existing administration hints. All 86 booking lifecycle test files passed.
- The public-experience Playwright suite passed 165 checks, with three expected
  desktop-only checks skipped on smaller viewports. It covers 320×800,
  390×844, 768×1024 and 1440×900, plus 699px/700px transitions, shared consumers,
  URL/session transfer, stale responses, availability, guest capacity, Bespoke,
  request validation, pet retention and changed-price resubmission.
- After the final automatic-selection refresh correction, the focused booking
  page suite passed all 44 checks across the same four viewports, including an
  already-open neutral calendar gaining availability when a stay is selected.
- `npm run test:booking-request` passed. A uniquely named far-future Bespoke
  fixture was submitted through the UI, verified in the local database (party,
  pet details and skipped notification deliveries), and resumed through its
  private page after reload. It supplied only a fictitious telephone number,
  with no email or WhatsApp consent. The fixture was deleted in `finally`.
- Chrome DevTools inspected `/book/` at 320×800, 390×844, 768×1024 and 1440×900,
  the Cottage mobile dock and the Contact tablet panel. Checked selected and
  blocked dates, two-month layout, request and pet sections, local scrolling,
  keyboard selection, visible focus, Tab progression, Escape/focus return,
  console messages and availability/quote requests. The original example still
  returns £1,730 for 19–23 October and six adults. No unexpected console errors
  or document overflow were observed. A disposable failed-availability response
  verified disabled unknown dates, retained selection and retry; the fixture was
  removed afterwards.
- Final open-calendar Lighthouse snapshots scored 100 in all reported categories
  on desktop and mobile. Reports: `/tmp/e11-lighthouse-desktop-bounded/` and
  `/tmp/e11-lighthouse-mobile-bounded/`. These snapshots do not measure
  performance or establish accessibility of content obscured by the calendar.
- With the footer visible, other mobile snapshots scored 96–97 for accessibility
  and 100 in the remaining categories. Their sole failure was the pre-existing
  footer paragraph contrast (2.4:1), retained as a later-feature candidate.
  The request-form report is `/tmp/e11-lighthouse-request-mobile/`.

Limitations: most browser outcomes use local API fixtures; actual persisted
creation was verified for the non-notifying Bespoke path. Standard price-change
and conflict scenarios use intercepted responses. No production changes,
customer contact, private-page redesign or administration acceptance run was
performed. These limitations remain part of the accepted F01 record. F01 is
closed. The subsequent F02 and F03 records complete this epic.

### E11-F02

Implemented and accepted on 8 September 2026 on
`agent/e11-f02-booker-details-review`. Closed by the owner's explicit acceptance
of implementation commit `6533f3f`, with the verification evidence and
limitations recorded below.

- Added the three-step journey, immediate checked-stay entry, stay summary/Edit
  stay, contact-first details, conditional pets, optional promo code and final
  review with Edit details and explicit request submission.
- Successful shared-panel continuation links carry `bookingContinue=checked`.
  A matching session result remains valid for entry intent for 15 minutes.
  Ordinary date links remain at step 1. Both entry paths obtain fresh checks;
  background failures preserve answers and disable progression until resolved.
- Extended the typed panel integration with check state, retry and lifecycle
  notifications. Price-change review remains usable after editing details;
  availability conflicts focus the stay editor. Dates and party summaries use
  British date formatting and singular/plural labels.
- Added optional `promoCode` to the request API and repository, with additive
  migration `058_booking_promo_code.sql` (`promo_code VARCHAR(80)`, nullable).
  The server rejects non-string/oversized codes, trims outer whitespace,
  preserves case and stores missing/blank codes as NULL. Host reservation
  details show the code for review. Pricing rules and totals are unchanged.
- Booker answers remain in page memory through edits; no new contact information
  is added to URLs or browser storage. No promotion-management workflow or
  automatic discount is included.

Verification:

- Final local Docker build and startup passed, including the additive migration.
  Astro reported 0 errors, 0 warnings and the same two existing administration
  hints. All 86 booking lifecycle test files passed.
- The final public-experience Playwright suite passed 189 checks with three
  expected desktop-only skips. Its 64 focused booking-page checks cover checked
  and ordinary entry, session expiry/mismatch, storage-disabled continuation,
  background failures/retry, conditional pets, contact validation, promo review,
  editing, changed-price resubmission, conflicts and the shared calendar.
- The final `npm run test:booking-request` passed with disposable far-future
  Bespoke fixtures. It verified persisted party/pet data, trimmed code and host
  reservation display, private-page reload, rejected invalid codes, and missing
  or blank-code compatibility. A disposable administrator session supplied host
  access. Fixtures had no email or WhatsApp consent; notification deliveries for
  the UI request were skipped. All fixture bookings and the administrator were
  removed in `finally`.
- Chrome DevTools inspected the rebuilt application at 320×800 and 390×844 with
  mobile/touch emulation, 768×1024 tablet and 1440×900 desktop. Checked contact
  ordering, pet fields, details/review/editing, focus and Tab operation, visible
  focus, accessible names, calendar Escape/focus return, retained answers,
  availability failure/retry and real unavailable-date responses. No console
  errors or overflow in these representative layouts were observed.
- An additional 320px desktop-window check (with a 15px scrollbar, leaving 305px
  of content width) exposed the pre-existing public shell's 320px minimum width.
  The 320px mobile viewport fits. This narrow desktop limitation remains a
  later shared-layout candidate.
- Final Lighthouse snapshots: review desktop and phone accessibility 96;
  details phone accessibility 97; best practices, SEO and agentic browsing 100.
  The sole failed audit remains the existing footer paragraph contrast (2.4:1).
  Reports: `/tmp/e11-f02-lighthouse-review-desktop/`,
  `/tmp/e11-f02-lighthouse-review-phone-final/` and
  `/tmp/e11-f02-lighthouse-details-phone-final/`. Snapshot audits do not measure
  performance. The footer issue remains outside F02 and is not a new regression.

Limitations: standard submission/changed-price success is covered by intercepted
browser responses; real persisted creation uses non-notifying Bespoke fixtures.
Host code visibility was exercised by Playwright; interactive DevTools focused
on the public journey. The wider administration negotiation suite was not run.
No production deployment or customer contact was performed by verification.

### F02 post-acceptance CI correction

PR #145 exposed a test-environment mismatch: the persistence spec was discovered
by the CI regression suite but still connected to the local Docker database
port 5433 instead of CI's `DATABASE_URL` on port 5432. The spec now honours
`DATABASE_URL`, derives request origins and its disposable session cookie from
the active Playwright base URL, and disables recordings in both configurations.
It passed locally through both the CI regression configuration (with an explicit
database URL) and the standalone local command. Product behaviour and F02
acceptance are unchanged.

### E11-F03 and epic closure

Accepted and closed with owner approval on 9 September 2026. Implementation
commit `a3fbb02` and documentation commit `4b2c90a` were merged through
[PR #149](https://github.com/OlrigBank/soccotash/pull/149) into `development` as
`c12890f`. All four PR checks passed. All three post-merge workflows also passed:
booking access lifecycle, holiday-planner browser regression and public-experience
browser regression. Detailed local browser, integration and Lighthouse evidence
is retained in the F03 feature record.

The owner planned Render Soccotash deployment after successful checks. Actual
hosted deployment and real email/SMS delivery were not independently verified
as part of this closure; the
[Render test checklist](../../../render-test-deployment.md) remains the operational
handoff. Closure records owner acceptance and does not claim those tests ran.

No implementation work remains in F01, F02 or F03. Contact-form styling, copy,
footer contrast and broader page-layout ideas are outside the accepted scope;
any follow-up should be defined separately. Existing verification limitations
remain recorded above and in F03.

## Verification plan

- Focused booking lifecycle tests and Playwright coverage for the landing page,
  four listings, generic public pages and `/book/`.
- Two-month navigation and year boundaries; selected-month opening; blocked
  arrivals, blocked ranges, valid boundary departures and minimum stays.
- Arrangement changes, automatic selection, Bespoke, refreshed conflicts,
  late responses, loading, failures and retry; selection retention across
  navigation, responsive changes and disabled session storage.
- Incoming fresh checks, one-page continuation, pet visibility/preservation,
  required contact validation, changed quotes and safe request resumption.
- Rebuild the running application and inspect with Chrome DevTools at
  320×800, 390×844, 768×1024 and 1440×900, plus the 699px/700px breakpoint.
- Check document/local overflow, focus, accessible structure, console errors
  and relevant network behaviour. Run desktop/mobile Lighthouse audits,
  investigate failures and repeat after corrections.
- Use disposable local fixtures or non-notifying previews. Do not contact
  customers or use real private links. Record exact tools, states and limitations.

## Out of scope

- Defining or implementing later features before F01 acceptance.
- Private booking-page and administration redesigns.
- Changing accommodation definitions, occupancy or pricing policy, availability
  sources or payment providers. F03 explicitly adds account identity storage and
  SMS verification; other communication-channel changes remain outside scope.
- Merging, deploying or changing production data without owner approval.
