# E11 — Redesign the booking page

## Status

In progress. E11-F01 is accepted and closed as of 8 September 2026.
The owner has pushed the implementation on `agent/e11-redesign-booking-page`
and confirmed this feature/step is complete. The epic remains open for the next
planning session; later features remain undefined.

## Epic summary

Follow [E10 — Introduce one booking widget](e10-f00-introduce-one-booking-widget.md)
by bringing the shared booking panel into `/book/`. Simplify the request journey
and remove duplicate stay selection, availability checking and pricing controls.
The first feature is now accepted and closed. Define the remaining sequence in
the next planning session using the delivered behaviour and evidence below.

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

Keep the compact panel inline on `/book/` at every width. Present two stages:
**Check your stay** and **Send your request**. The panel owns checking and
provisional pricing; its Book action on `/book/` reveals and focuses request
details rather than navigating back to the same page.

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

Later features remain undefined. Candidates from the initial review include
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
closed; only the next feature definition is pending.

### Next planning session

Use the accepted F01 implementation as the baseline. Agree the next feature's
scope and acceptance criteria before implementation. The contact-form styling,
copy, footer contrast and page-layout ideas above are candidates, not committed
features. No further F01 implementation work is outstanding.

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
  sources, database domain models, payment providers or communication channels.
- Merging, deploying or changing production data without owner approval.
