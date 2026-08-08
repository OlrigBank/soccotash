# Proposed PR #85 — Refine the Booker’s reservation experience

## Status

- Parent branch: `development`
- Feature branch: `agent/refine-bookers-reservation`
- Intended merge target: `development`
- Delivery style: rapid, reviewable interface iterations
- Primary audience: Bookers using the private booking view
- Database migration: prohibited

## Objective

Refine the Booker-facing reservation experience through a short, rapid feedback
cycle. Make the private booking view easier to understand and use on phones and
desktops without changing booking lifecycle rules, persisted data, permissions
or operational processes.

The work should help a Booker quickly understand the reservation, its current
status, what has happened, what they need to do next and how to communicate with
Olrig Bank.

## Accepted interface direction

- Private Booker pages use dedicated booking-area chrome and do not present the
  public Olrig Bank navigation as if the Booker were browsing the main website.
- The private booking link opens a booking landing page with focused access to
  Reservation, Chat and the Holiday Planner.
- Each focused workspace provides one **Back to booking** route to the private
  landing page.
- The public Olrig Bank website remains available through an explicit link that
  opens in a separate browser tab or page.
- The save-link section belongs on the booking landing page, and its copy action
  always stores the canonical private landing-page URL rather than a workspace
  URL.
- Reservation is a standalone page rather than a drawer. Stay details, payment
  summary and history, price breakdown, responses and cancellation are clearly
  labelled sections.
- Wide reservation records such as payment-history tables scroll within their
  own section and must not cause page-level horizontal overflow.
- The dedicated private layout continues through the editable Holiday Planner,
  printable itinerary and proposal-review pages.
- These presentation changes do not alter private-link credentials, lifecycle
  rules, payment handling, messages, planner permissions or persisted data.

## Working method

Each iteration follows one loop:

1. Agree one focused Booker-facing outcome.
2. Change the smallest relevant template, component, style or client-side
   enhancement.
3. Rebuild or refresh the local Docker deployment.
4. Review the private booking journey at representative phone and desktop
   widths.
5. Adjust immediately from feedback.
6. Add or update a focused regression contract when behaviour changes.
7. Commit a coherent checkpoint only when the iteration is accepted.

Several interface iterations may be accumulated in PR #85. Rapid delivery must
not weaken privacy, accessibility, authentication, lifecycle or payment
boundaries.

## In scope

### Booker reservation presentation

- Information hierarchy for property, dates, party, price and booking status.
- Clear presentation of the next action expected from the Booker.
- Reservation, offer, payment, cancellation and confirmation summaries.
- Booker conversation and notification presentation.
- Booking-linked Holiday Planner access and context.
- Empty, pending, success, validation, declined, expired and cancelled states.
- Mobile and desktop layout, spacing, typography and action placement.

### Interaction

- Clear navigation between Booker-facing reservation sections.
- Directly visible content where disclosure adds no value.
- Progressive disclosure where secondary detail would otherwise overwhelm the
  primary task.
- Keyboard-operable controls, visible focus and accessible status updates.
- Touch-friendly controls and prevention of page-level horizontal overflow.
- Client-side enhancement only where the server-rendered journey remains usable.

### Refactoring allowed for interface delivery

- Extracting or consolidating Booker-facing Astro components.
- Reorganising CSS without changing domain behaviour.
- Small formatting or view-model helpers that do not alter persisted data.
- Reusing existing routes and mutations through a clearer interface.
- Adding unit, contract or browser tests for changed presentation and journeys.

## Hard database boundary

PR #85 must not include:

- New, removed or altered database tables, columns, constraints or indexes.
- SQL migration files or edits to existing migrations.
- Data backfills, repair scripts or persistence-format conversions.
- Changed identifier semantics or relationships between persisted records.
- New product capability disguised as an interface refinement.
- Any change requiring a deployment-time migration or manual database action.

If an interface idea requires one of these changes, document it as a separate
future feature and keep it out of this rapid iteration branch.

## Existing behaviour to preserve

- Private Booker links remain bearer credentials with their existing expiry,
  rotation and revocation behaviour.
- Booker access remains limited to the reservation associated with the link.
- Offer acceptance and decline rules remain unchanged.
- Payment reporting and administrative verification remain unchanged.
- Cancellation permissions, reasons, notifications and date-release rules remain
  unchanged.
- Booking and offer prices retain their existing source and meaning.
- Messages retain actor attribution and notification behaviour.
- Holiday Planner ownership, roles, privacy and revision rules remain unchanged.
- Manual operational intervention remains part of the current booking process.
- Existing sanitisation, notification and audit boundaries remain intact.

## Accessibility and responsive baseline

- Use semantic headings, links, buttons, forms and disclosures.
- Maintain keyboard access and visible focus.
- Do not communicate state through colour alone.
- Keep phone form controls at 16px or larger and interactive targets at least
  44px where practical.
- Respect reduced-motion preferences.
- Keep the server-rendered view usable without client JavaScript.
- Avoid document-level horizontal overflow at 320px, 375px and 430px.
- Provide meaningful labels and live announcements for status changes.
- Keep destructive or consequential actions explicit and confirmable.

## Out of scope

- Database or migration work of any kind.
- New booking, payment, messaging or planner capabilities.
- Changes to administrator booking-management workflows except where necessary
  to preserve an existing shared component contract.
- Authorization, token-policy or lifecycle-rule redesign.
- Deployment automation or production activation.
- Changes to manual operational controls around bookings.
- Broad dependency upgrades or architectural rewrites.

## Acceptance criteria

- The Booker can identify the reservation, its status and the next expected
  action without searching through unrelated content.
- Primary actions are clearly distinguished from navigation and secondary detail.
- Each accepted change has a visible Booker-facing purpose.
- The journey works at representative phone and desktop widths.
- Existing server-side permissions and domain behaviour remain unchanged.
- No database definition or migration file is added or modified.
- Forms remain understandable and recoverable after validation or conflict
  failures.
- Keyboard, screen-reader and touch use do not regress.
- Private credentials and reservation information remain protected.
- The local Docker HTTPS deployment builds and serves the accepted experience.
- Focused contracts cover durable interaction and responsive behaviour changes.

## Validation

Run focused checks during each iteration, then complete the full gate before PR
#85 is merged:

- Focused tests for changed Booker templates, components and helpers.
- `npm run test:booking-lifecycle`.
- `npm run test:booking-integration` when an iteration touches an existing server
  mutation or persistence read.
- `npm run check`.
- `npm run build`.
- Local Docker rebuild and authenticated private-link acceptance.
- Phone-width checks at 320px, 375px and 430px.
- Desktop regression checks for each materially changed page.
- Keyboard and no-JavaScript review of consequential actions.
- `git diff --check` and explicit confirmation that `db/` is unchanged.

## Delivery sequence

1. Start `agent/refine-bookers-reservation` from the latest `development`.
2. Iterate rapidly through the local HTTPS deployment using a private Booker
   reservation.
3. Commit accepted interface checkpoints to the feature branch.
4. Push the branch and open PR #85 against `development`.
5. Run the complete validation gate and review the aggregate diff.
6. Merge only when the Booker experience is accepted and the no-database-change
   boundary has been confirmed.
7. Delete the completed feature branch.
