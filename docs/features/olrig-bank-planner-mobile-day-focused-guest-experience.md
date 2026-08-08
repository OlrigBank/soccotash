# Proposed PR — Mobile Holiday Planner: day-focused guest experience

## Status

- Parent foundation: `agent/mobile-ui-optimisation`
- Feature branch: `agent/mobile-holiday-planner-day-focus`
- Intended merge target: `agent/mobile-ui-optimisation`
- Planner epic: complete; this is a new post-epic feature
- Database migration: not expected

## Objective

Turn the booking-linked Holiday Planner into a day-focused mobile companion
without weakening its existing editing, collaboration, Local Guide, revision,
sharing, printing or external-AI behaviour.

At phone widths, guests should navigate one selected day at a time, understand
that day's itinerary quickly, and reveal editing controls only when needed. The
existing all-days document remains the authoritative printable and shared
presentation.

## Product outcome

The default phone experience changes from one long sequence of fully expanded
day and item forms to:

```text
Our Kendal holiday
6–12 August

Thu 6   Fri 7   Sat 8   Sun 9  →
         Today

Friday 7 August
Exploring Kendal

09:30  Breakfast at Olrig Bank
        Agreed

11:00  Kendal Castle
        Kendal · Olrig Bank recommendation

13:00  Lunch at …
        Booked

                         + Add to Friday
```

Desktop editing may retain the existing expanded workspace where it remains
useful. Print and sanitized share views continue to render every permitted day.

## Scope

### Day selection

- Add a horizontally scrollable, touch-friendly selector for plan days on
  Booker and invited-participant planner pages.
- Render only the selected day at mobile widths.
- Encode an explicit selection in the URL using a stable day public ID, for
  example `?day=<day-public-id>`.
- Select days in this order:
  1. a valid day requested in the URL;
  2. today's dated plan day, calculated in `Europe/London`;
  3. the first day in saved plan order.
- Label undated plans by position (`Day 1`, `Day 2`) and dated plans with short,
  unambiguous weekday/date labels.
- Preserve useful browser back, forward, refresh and link behaviour.

### Compact day and item presentation

- Present the active day as a concise heading, date and summary.
- Render plan items as compact cards in their explicit saved position order.
- Do not silently reorder items by time; untimed and flexible activities must
  remain predictable.
- Prioritise time, title, location and meaningful lifecycle state.
- Keep `booked`, `cancelled` and `proposed` unmistakable without relying on
  colour alone.
- Express item type with restrained text or iconography instead of dominant
  uppercase metadata.
- Reduce a Local Guide reference to a compact recommendation marker and details
  link; do not repeat the full guide description in every collapsed card.

### Progressive editing

- Collapse the active day's edit form until the guest requests `Edit day`.
- Collapse each item's complete edit form until the guest requests `Edit`.
- Keep add, save, remove, reorder and move-to-day operations available.
- Reuse the existing planner APIs, permission checks, optimistic concurrency and
  revision creation rather than introducing parallel mobile mutations.
- After a successful mutation, retain the active day and move focus to a useful
  confirmation or updated element.
- After validation or stale-revision failure, retain entered values, reopen the
  relevant editor and expose the error to assistive technology.

### Responsive behaviour and accessibility

- Use semantic links, buttons, headings, forms and disclosure controls.
- Maintain at least 44px touch targets and 16px phone form controls.
- Make the day selector operable by touch, keyboard and screen reader.
- Expose selected-day state independently of colour.
- Respect reduced-motion preferences.
- Provide a usable server-rendered fallback when client JavaScript is absent or
  fails; enhancement must not hide the only route to planner content.
- Avoid document-level horizontal overflow at 320px, 375px and 430px widths.

### Existing behaviour to preserve

- Plan, day and item database semantics and stable identifiers.
- Owner, editor, contributor and viewer permissions.
- Booker and participant credential isolation.
- Item status, visibility, Local Guide references and private reservation notes.
- Activity history, stale-write detection and revision attribution.
- Guest contribution consent and administration moderation.
- Read-only share links and sanitized share representation.
- External-AI capabilities, proposal review and approval boundaries.
- The all-days printable itinerary and print CSS.

## Out of scope

- A conventional seven-column calendar.
- Maps, routing, weather or geocoding.
- A saved-but-unscheduled places collection.
- Changes to the planner schema or a database migration.
- Redesigning the administrator planner.
- Redesigning public example plans or sanitized share pages beyond preventing a
  regression.
- Letting an external AI mutate the living plan directly.
- Changing saved item order automatically from entered times.

## Proposed implementation steps

### 1. Establish the mobile day-view contract

- Identify the shared Booker/participant rendering and mutation boundaries.
- Add focused source/logic tests for day selection and phone presentation.
- Introduce a small day-selection helper with deterministic
  `Europe/London` behaviour and tests covering daylight-saving boundaries.
- Treat invalid, missing or foreign day IDs as a safe default rather than
  disclosing whether another plan contains that identifier.

### 2. Add URL-addressable day navigation

- Render the day selector from accessible links so navigation works without
  JavaScript.
- Preserve required planner credentials in the path while changing only the
  allowed `day` query parameter.
- Mark the current day with `aria-current` and ensure the active tab scrolls
  into view when enhanced by JavaScript.
- Keep all days visible in desktop editing until desktop behaviour is explicitly
  changed by a later design decision.

### 3. Introduce compact mobile cards

- Separate read presentation from the existing edit fields without duplicating
  domain rules.
- Add clear states for timed, untimed, flexible, booked, proposed and cancelled
  items.
- Add a concise Local Guide reference with a link to its public entry when that
  entry remains available.
- Preserve plan-owned descriptions and location text without confusing them
  with general Local Guide content.

### 4. Apply progressive disclosure to editing

- Wrap day and item editors in accessible disclosures or equivalent controlled
  panels.
- Ensure save, validation, conflict and removal flows return to the selected day.
- Reopen the affected disclosure when server/client validation fails.
- Retain accessible confirmations and destructive-action prompts.
- Verify role restrictions both visually and at every mutation endpoint.

### 5. Refine mobile actions and navigation

- Place `Add to <day>` close to the active itinerary.
- Keep reorder and move controls understandable without drag-only interaction.
- Avoid fixed controls obscuring content; account for phone safe areas if a
  sticky action is justified by browser testing.
- Confirm focus order remains logical when disclosures open and close.

### 6. Protect document and collaboration views

- Confirm print renders every day and every permitted item regardless of the
  selected mobile day.
- Confirm sanitized share views remain complete and contain no newly exposed
  private fields.
- Confirm AI representations and proposal operations are unchanged.
- Confirm Local Guide contribution eligibility and consent are unchanged.

### 7. Add browser regression coverage

- Exercise 320px, 375px and 430px viewports.
- Cover dated plans during, before and after the stay.
- Cover undated/example-derived plans.
- Cover URL selection, invalid selection, refresh and browser navigation.
- Cover Booker, editor, contributor and viewer presentation/permissions.
- Cover add, edit, validation failure, stale conflict, move, reorder and remove.
- Assert no page-level horizontal overflow and no inaccessible hidden editor.
- Assert print output still includes all plan days.
- Retain a desktop assertion proving the existing editing workspace has not been
  unintentionally collapsed.

### 8. Validate and document

- Run planner lifecycle and PostgreSQL integration suites.
- Run Astro checking and the production build.
- Rebuild local Docker and perform phone-width acceptance through HTTPS.
- Record screenshots or traces for representative Booker and participant paths.
- Update the feature document with implementation and verification evidence.

## Acceptance criteria

- A phone user sees one clearly selected plan day rather than every day expanded.
- During a dated stay, the planner opens on today's day unless a valid day was
  explicitly requested.
- An explicit day survives refresh and participates correctly in browser
  navigation.
- Undated plans have deterministic positional day navigation.
- Compact cards expose the information needed to use the itinerary without
  exposing all edit controls.
- A permitted guest can add, edit, reorder, move and remove items from the
  selected day using the existing mutation rules.
- Validation and concurrency failures are recoverable without losing context or
  submitted values.
- Viewer and contributor restrictions remain enforced server-side.
- Local Guide content is recognisable but compact in the collapsed view.
- Print and sanitized share views still render the complete permitted itinerary.
- External-AI proposal security and approval behaviour is unchanged.
- The planner has no document-level horizontal overflow at supported phone
  widths and remains keyboard/screen-reader operable.
- Desktop planner behaviour has no unintended regression.

## Test plan

- Unit tests for selection precedence, timezone handling and invalid day IDs.
- Contract tests for semantic navigation, disclosure and print preservation.
- PostgreSQL integration tests for existing planner mutation and revision rules.
- Playwright tests for Booker and participant mobile journeys at representative
  viewport widths.
- Permission tests for owner, editor, contributor and viewer roles.
- Regression tests for Local Guide references, sharing, printing and AI proposal
  boundaries.
- `astro check`, production build and local Docker HTTPS acceptance.

## Delivery sequence

1. Implement and test on `agent/mobile-holiday-planner-day-focus`.
2. Review the day-focused mobile experience through local Docker HTTPS.
3. Merge locally into `agent/mobile-ui-optimisation` after acceptance.
4. Delete the completed feature branch.
5. Merge the combined mobile feature into `development` only after the complete
   mobile work has passed validation.
