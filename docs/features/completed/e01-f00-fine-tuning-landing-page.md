# E01 — Fine-tuning the Landing Page

## Status

Active.

## Epic summary

Improve the public landing page as a focused direct-booking journey. Begin by
making the opening Quick Check smaller, clearer and more useful, then refine
the sections that follow it so the page presents the right information in the
right order without repeating booking prompts.

This epic builds on the existing availability, occupancy, pricing and request
journey. It does not introduce instant confirmation, payment or a second
booking engine.

## Desired outcome

A visitor arriving on a phone can understand the proposition, define dates
and party composition, receive the best available stay arrangement and continue to a
request with minimal scrolling and no repeated data entry. The content that
follows Quick Check should then help the visitor decide and proceed, rather
than restating choices already made by the search.

## Experience principles

- Put the booking decision before long introductory copy.
- Keep the photographic identity of Olrig Bank visible.
- Use compact controls that disclose detail only when the visitor needs it.
- Ask visitors for dates and party composition before suggesting an
  arrangement.
- Keep suggestions provisional and distinguish them from confirmed quotes.
- Preserve entered state when continuing into the complete request journey.
- Avoid duplicate booking panels, calls to action and explanatory content.
- Retain accessible labels, keyboard operation and useful touch targets.

## Feature sequence

### E01-F01 — Booking-first hero and compact Quick Check — Completed

[Feature record](../e01-f01.md)

Implemented the first stage of the epic:

- moved Quick Check into the photographic homepage hero;
- replaced the long opening paragraph with concise booking-focused copy;
- removed the duplicate standalone homepage panel;
- combined check-in and check-out into one compact date control;
- condensed party composition into a guest summary with an expandable
  plus/minus selector for adults, children, infants and pets;
- removed the up-front stay-arrangement selector;
- selected and displayed the smallest suitable available stay after the check;
- grouped the total, offered arrangement, **Reserve** action and no-charge note
  in one result card, replacing the **Quick Check** action after a match; and
- shortened the host-priced response so it supports the next action without
  repeating internal review detail.

### E01-F02 — Homepage discovery and direct-booking finish — Completed

[Feature record](../e01-f02.md)

Implemented the content and page finish following Quick Check:

- added an accessible, responsive photo gallery for the house, Cottage and
  garden;
- reshaped **Ways to stay at Olrig Bank** around the property's exterior image,
  concise package details and direct listing links;
- removed the repetitive accommodation-card grid;
- replaced the six-card featured-guide grid with one Kendal Castle panel that
  promotes the curated local guide;
- introduced a richer direct-booking footer with valid public navigation; and
- added one mobile **Check availability** action, removing non-working WhatsApp
  actions before completion.

### Later features

The next features may continue to refine the landing page in response to
visitor feedback and measured booking behaviour. Candidate work includes:

- deciding what should immediately follow a successful or incomplete check;
- reviewing gallery engagement and whether its image order should change;
- measuring use of the stay-option and local-guide links; and
- further tightening mobile page length without weakening useful discovery.

Each follow-on feature must define its own content goal, acceptance criteria
and browser-review widths before implementation.

### Post–Quick Check result state — Completed

Implemented and locally validated on 29 August 2026.

After a successful homepage **Quick Check**, the compact panel must stop
presenting **Quick Check** as an available action. In the same panel, while
preserving the selected dates and party composition, it should replace that
action with the matched result in this exact reading order:

1. the formatted provisional total followed by the word **total**, for example
   **£2,178.00 total**;
2. the matched stay name, for example **Olrig Bank (max 8 guests)**;
3. a primary **Reserve** continuation action; and
4. the reassurance **You won't be charged yet**.

Approved compact-panel wireframe:

```text
┌──────────────────────────────────────┐
│ Check-in       Check-out    Guests   │
│ 12/09/26       15/09/26     6 adults │
│                                      │
│ £2,178.00 total                      │
│ Olrig Bank (max 8 guests)            │
│                                      │
│ [              Reserve             ]│
│       You won't be charged yet       │
└──────────────────────────────────────┘
```

The rendered design mock-up is available at
[`../mockups/e01-post-quick-check-panel.html`](../mockups/e01-post-quick-check-panel.html).
It remains a design record and is not loaded by the public application.
Captured review views:

- [390×844](../mockups/e01-post-quick-check-390x844.png)
- [768×1024](../mockups/e01-post-quick-check-768x1024.png)
- [1440×900](../mockups/e01-post-quick-check-1440x900.png)

Acceptance criteria:

1. A successful result hides or removes the **Quick Check** submit button for
   as long as that result remains current.
2. The result uses the exact four-part order above: total, stay name,
   **Reserve**, reassurance.
3. **Reserve** retains the selected property, dates, adults, children, infants
   and pets when continuing to `/book/`.
4. Changing any date or party value clears the stale result and restores
   **Quick Check**.
5. A host-decision result with a server-calculated estimated published price
   uses the same compact continuation state. Pending, unavailable, unpriced
   and error results remain distinct and do not display a misleading
   **Reserve** action.
6. The result remains readable, keyboard-operable and free of horizontal
   overflow at 390×844, 768×1024 and 1440×900.

Implementation validation:

- the rebuilt Docker service passed its health and database checks;
- the deployed component displayed **£2,178.00 total**, **Olrig Bank (max 8
  guests)**, **Reserve** and **You won't be charged yet** in that exact order;
- changing a party value cleared the stale result and restored **Quick Check**;
- **Reserve** continued to `/book/` with the selected arrangement, dates and
  complete party composition preserved;
- Playwright checks at 390×844, 768×1024 and 1440×900 found no horizontal
  overflow, console errors or failed page requests; and
- when Docker's quote response follows the host-decision branch but includes a
  server-calculated estimated published price, the homepage displays that
  estimate in the same compact continuation state instead of leaving **Quick
  Check** beside a generic continuation link; and
- the real Docker-backed 2-adult check for 19–22 October 2026 produced
  **£1,335.00 total**, **Olrig Bank (max 8 guests)**, **Reserve** and the
  no-charge reassurance without request interception.

## Epic-level constraints

- The server remains authoritative for availability, occupancy and pricing.
- A Quick Check does not reserve dates or confirm a booking.
- The full `/book/` journey remains responsible for contact details, detailed
  occupancy information and request creation.
- Listing-page panels must continue to work with their fixed arrangements.
- Homepage-only presentation changes must not change listing-panel behavior.
- Existing public routes, analytics events and continuation parameters remain
  supported.

## Validation baseline

Every feature in this epic should include, in proportion to its scope:

- `npm run check`;
- a production Docker build;
- `git diff --check`;
- browser inspection at 390×844, 768×1024 and 1440×900 when layout changes;
- keyboard and touch review for new controls; and
- checks for horizontal overflow and browser-console errors introduced by the
  application.
