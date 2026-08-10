# Proposed PR #86 — Refine guest Holiday Plan creation

## Status

- Parent branch: `development`
- Feature branch: `agent/refine-guest-holiday-plan-creation`
- Intended merge target: `development`
- Delivery style: rapid, reviewable product iterations
- Primary audience: Bookers creating a booking-linked Holiday Plan
- Database changes: permitted when justified, migrated and tested

## Objective

Refine the complete process through which a Booker creates and begins using a
Holiday Plan for a confirmed booking. The experience should move naturally from
the booking landing page into plan creation, initial setup and the first useful
planning action without requiring the guest to understand the underlying
Planner model.

This branch is not limited to presentation. Iterations may change persistence,
domain services, routes, APIs, lifecycle integration and supporting
administration where those changes are necessary to produce a coherent guest
plan-creation journey.

## Product outcome

A Booker with an eligible booking should be able to:

1. Understand whether a Holiday Plan is available and what it is for.
2. Start creating a plan from the private booking area.
3. Choose an appropriate starting point, such as an empty plan or a suitable
   example, without losing ownership or privacy boundaries.
4. Confirm the plan’s dates and initial structure.
5. Arrive at a useful first planning view with a clear next action.
6. Safely resume the same plan from the booking landing page later.

## Accepted first iteration — focused activity planning

The guest Planner landing page is organised beneath **Back to booking** as three
collapsible sections. The Booker name is omitted:

1. **Local Guide** is initially collapsed. It follows the public Explore
   category structure, but each result is reduced to its title. Opening a title
   shows the public entry in a new tab. An entry can be dragged or explicitly
   added to Candidate activities.
2. **Candidate activities** is a persistent ordered backlog with the highest
   priority first. Guests can reorder it, schedule an activity onto a day, or
   create a custom candidate with a guest-supplied title, HTTP(S) URL and
   description. The supplied page can be opened in a new tab for the guest to
   verify; Olrig Bank does not fetch or inspect the remote URL.
3. **Your plan** has one tab for each date of the booked stay. Each day is an
   ordered list from first to last activity. Opening an activity shows all
   stored editable details. An activity can be returned to the candidate
   backlog.

Fallback actions are consolidated into a compact, labelled three-dot menu on
each candidate and scheduled activity. The menu contains reordering,
scheduling/return and confirmed removal actions, avoiding a row of persistent
buttons on small screens. A later iteration may let guests dismiss Local Guide
suggestions, but must not delete the underlying shared Local Guide entry.

Within Local Guide, categories use a single-selection accordion. The category
root is initially open beneath an empty, closed selected-category slot.
Selecting a category closes the root, moves that category into the selected
slot and opens its minimal entry list. Closing it clears the slot and reopens
the category root, so multiple categories can never remain expanded together.

Local Guide entries, candidate activities and scheduled activities retain the
same compact grip icon as their drag affordance. A scheduled activity can be
dragged to reorder it within a day or moved back to Candidate activities. The
Local Guide grip remains a keyboard-operable button: selecting it adds the
entry to candidates, preserving the non-drag path without consuming row space.

The complete set of holiday days is shown in a persistent, horizontally
scrollable tab strip at the top of the workspace. Selecting a tab opens that
day. Dropping a candidate directly onto any tab schedules it on that day and
opens the destination day. Adding a Local Guide entry closes the selected
category and restores the category root.

Drag-and-drop is an enhancement, not the only interaction: visible buttons and
select controls provide equivalent keyboard, touch and assistive-technology
operation. Existing participant, sharing, AI, contribution, proposal and other
advanced Planner capabilities remain implemented, but their guest-facing
sections are deliberately not rendered or reachable in this iteration.

Ineligible, conflicting, stale and failed creation attempts must produce clear,
recoverable outcomes.

## Working method

Each iteration follows one loop:

1. Agree one focused guest outcome or observed problem.
2. Trace the current interface, route, service and persistence behaviour that
   supports it.
3. Implement the smallest coherent vertical change.
4. Apply migrations and seed or test-data updates when the accepted design
   requires them.
5. Rebuild the local Docker deployment and review the real private-link journey.
6. Test at representative phone and desktop widths, including failure states.
7. Add focused unit, contract, integration or migration coverage.
8. Commit an accepted checkpoint before beginning a materially different
   iteration.

Rapid feedback does not remove the need for explicit lifecycle, privacy,
concurrency, migration and rollback reasoning.

## In scope

### Guest experience

- Holiday Planner availability and call-to-action presentation on the booking
  landing page.
- Plan-creation entry, explanation, choices and confirmation.
- Empty-plan and example-plan starting paths.
- Initial title, summary, dates, days and first-item experience.
- Progress, success, validation, stale-state, conflict and retry presentation.
- Clear continuation into the day-focused mobile Planner.
- Returning to the booking landing page and resuming the same plan.
- Accessible keyboard, screen-reader, touch and no-JavaScript fallbacks where
  server-rendered interaction is practical.

### Domain and service behaviour

- Eligibility rules for creating a booking-linked plan.
- Idempotent creation and prevention of accidental duplicate plans.
- Ownership assignment and booking-to-plan association.
- Example discovery, suitability and independent-copy semantics.
- Date and duration alignment between booking and plan.
- Transaction boundaries, optimistic concurrency and activity attribution.
- Clear error codes and recoverable service outcomes for the guest interface.

### Persistence and migrations

- New or altered Planner fields, constraints and indexes when required by the
  accepted product design.
- Safe forward migrations and, where practical, rollback or compatibility
  considerations.
- Deterministic backfills for existing booking-linked plans when semantics
  change.
- Test fixtures and migration verification for both fresh and existing data.
- Database constraints that enforce invariants relied upon by the guest flow.

### Supporting administration

- Limited administrator presentation or controls needed to support, diagnose or
  recover guest plan creation.
- Audit and activity views needed to explain creation outcomes.
- Example-plan metadata or publication controls required by the guest starting
  experience.

## Database-change governance

Database work is permitted, but every change must:

- Be directly connected to an accepted PR #86 product outcome.
- Use a numbered migration following repository conventions.
- Preserve existing data or include an explicit deterministic transformation.
- Define constraints and indexes intentionally rather than relying only on
  application checks.
- Be safe to apply once in deployment and safe to encounter in local or CI
  environments that already contain earlier migrations.
- Include migration and integration coverage proportional to risk.
- Document operational or rollback implications in the PR.
- Avoid unrelated schema cleanup or speculative future fields.

Destructive data changes require explicit review before implementation.

## Existing boundaries to preserve unless explicitly revised

- Private Booker links remain scoped bearer credentials with existing expiry,
  rotation and revocation controls.
- A Booker must not gain access to another booking or plan.
- Booking lifecycle eligibility remains authoritative for guest plan creation.
- The Booker is the owner of a plan created for their booking.
- Example content is copied independently; later example edits do not mutate a
  private booking plan.
- Private items, reservation notes, participants and credentials are not copied
  from public examples.
- Planner roles, invitation credentials and sanitized sharing remain enforced.
- Optimistic concurrency prevents silent overwrites.
- Activity and revision attribution remain accurate.
- External-AI capabilities and proposals remain explicitly authorized and
  reviewable.
- Local Guide contribution consent and moderation boundaries remain intact.

Any intentional revision to one of these boundaries must be documented in this
feature brief and the PR description before merge.

## Accessibility and responsive baseline

- Use semantic headings, links, buttons, forms, fieldsets and status messages.
- Maintain keyboard access, visible focus and logical focus movement after
  creation or errors.
- Do not communicate state through colour alone.
- Keep phone form controls at 16px or larger and interactive targets at least
  44px where practical.
- Respect reduced-motion preferences.
- Avoid document-level horizontal overflow at 320px, 375px and 430px.
- Keep the primary creation decision understandable without dense Planner
  terminology.
- Announce asynchronous success, validation and conflict outcomes.
- Preserve entered information when a recoverable error occurs.

## Security and privacy requirements

- Resolve the current booking credential on every private route and mutation.
- Enforce same-origin or appropriate request-integrity protection for mutations.
- Never accept booking, owner or plan identity solely from guest-controlled
  fields.
- Return non-disclosing not-found responses for unavailable credentials or
  resources.
- Do not expose private plan content in public examples, logs or analytics.
- Maintain no-index and private-cache behaviour across the creation journey.
- Rate-limit or otherwise bound any newly introduced expensive or externally
  connected operation.

## Out of scope by default

- Redesigning unrelated administrator Planner workflows.
- General public Holiday Planner discovery unrelated to a private booking.
- Replacing the existing role, sharing or AI collaboration systems wholesale.
- Broad booking lifecycle, payment or messaging redesign.
- Dependency upgrades unrelated to an accepted implementation need.
- Speculative schema or architectural work without a current guest outcome.
- Production activation beyond the repository’s existing deployment process.

Items may move into scope only through an explicit update to this brief.

## Acceptance criteria

- An eligible Booker can create exactly one booking-linked plan through a clear
  private journey.
- Repeated submission or page refresh does not create duplicate plans.
- The Booker becomes the plan owner and can resume it from the booking landing
  page.
- Empty and example-based starting paths preserve privacy and independent-copy
  semantics.
- Booking dates and plan dates remain valid and understandable.
- Ineligible, stale, conflicting and failed attempts provide safe, recoverable
  outcomes.
- The accepted experience works at representative phone and desktop widths.
- Keyboard, screen-reader and touch use do not regress.
- New persistence invariants are enforced and migration-tested.
- Existing booking, Planner, Local Guide and credential boundaries remain intact
  unless an intentional revision is documented and approved.
- The local Docker HTTPS deployment builds and serves the accepted journey.

## Validation

Run checks proportionally during each iteration, then complete the full gate
before PR #86 is merged:

- Focused unit and contract tests for changed UI, services and policies.
- Integration tests for creation, idempotency, ownership, eligibility and
  example-copy behaviour.
- Migration tests against both an empty database and representative existing
  Planner data when schema changes are included.
- `npm run test:booking-lifecycle`.
- `npm run test:booking-integration`.
- `npm run check`.
- `npm run build`.
- Local Docker rebuild, migration and private-link acceptance.
- Phone-width checks at 320px, 375px and 430px.
- Desktop regression checks for the booking landing and resulting Planner.
- Keyboard, focus, validation, conflict and retry review.
- `git diff --check` and explicit review of every changed migration or database
  file.

## Delivery sequence

1. Start `agent/refine-guest-holiday-plan-creation` from the latest
   `development`.
2. Establish the current creation baseline with an eligible local booking.
3. Iterate through accepted vertical improvements and commit coherent
   checkpoints.
4. Apply and verify any required migrations locally before dependent interface
   changes are accepted.
5. Push the branch and open PR #86 against `development`.
6. Run the complete validation and migration gate.
7. Review the aggregate product, schema, security and operational impact.
8. Merge only when the guest creation journey and any migration implications
   are accepted.
9. Delete the completed feature branch.
