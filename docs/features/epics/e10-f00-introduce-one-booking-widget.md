# E10 — Introduce one booking widget

## Status

In progress. E10-F01 is implemented on the shared `CompactBookingPanel`; later
feature goals remain open.

Inspect the current use of booking mechanisms; calendars to identify arrival and departure dates,
the means to gather details of guest and pet totals and determine how one widget code base can meet all the different
requirements

## Epic summary


## Starting point


## Problem


## Desired outcome


## Experience boundary


## Design direction


## Workflow and behaviour principles


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
  until a later feature replaces it.
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

1. All in-scope customer-facing routes use a coherent visual language derived
   from the landing page while retaining layouts appropriate to their tasks.
2. Shared navigation and the principal action on each page remain clear and
   usable from 320px phone widths through desktop layouts.
3. A visitor can progress from discovery to a booking request without an
   unexplained change of interface or ambiguous booking state.
4. A Booker can safely resume and manage a reservation through a private link
   with clear status, required actions and routes into planning.
5. Invited guests and planning participants receive a coherent experience with
   their role and permitted actions made clear.
6. Existing availability, pricing, quotation, provisional-booking,
   reservation, messaging and planning invariants pass automated regression
   testing after any workflow changes.
7. Authentication, token privacy, authorisation, indexing and logging
   protections pass focused regression testing.
8. Changed pages meet the agreed accessibility and responsive requirements,
   with no document-level horizontal overflow at the tested widths.
9. Shared components used by administration pages continue to support their
   existing administration workflows.
10. Permanent browser coverage protects the agreed public shell and the most
    important customer journey transitions.
11. Every feature has an accepted record and completion evidence before the
    epic is marked complete.
12. Interface copy and documentation introduced or revised by the epic use
   British English and consistent booking terminology.

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

## Pull request summary


### Verification


## Out of scope

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

## Decisions required during feature planning
