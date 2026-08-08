# Proposed PR #84 — Rapid interface changes with no database changes

## Status

- Parent branch: `development`
- Feature branch: `agent/rapid-interface-changes-no-db`
- Intended merge target: `development`
- Delivery style: rapid, reviewable interface iterations
- Database migration: prohibited

## Objective

Create a short, fast feedback cycle for improving the Olrig Bank interface
without changing database structure, persisted-data meaning or server-side
business rules.

The branch is a controlled visual and interaction workspace. Changes should be
small enough to review through the local HTTPS deployment immediately, but may
be accumulated into PR #84 after the combined experience has passed regression
checks.

## Working method

Each iteration follows one loop:

1. Agree one focused interface outcome.
2. Change the smallest relevant templates, components, styles or client-side
   enhancement.
3. Rebuild or refresh the local Docker deployment.
4. Review at representative phone and desktop widths.
5. Adjust immediately from feedback.
6. Add or update a focused regression contract when behaviour changes.
7. Commit a coherent checkpoint only when the iteration is accepted.

Several iterations may happen before a checkpoint. Speed must not remove the
existing accessibility, privacy, permission or security boundaries.

## In scope

### Presentation

- Page hierarchy, spacing, typography, colour and responsive layout.
- Navigation, menus, headers, cards, forms, buttons, notices and disclosures.
- Mobile and desktop information density.
- Empty, loading, success, validation, conflict and error presentation.
- Print styling where an edited interface has an existing print contract.

### Interaction

- Progressive disclosure and clearer action placement.
- Focus management and accessible status announcements.
- Touch-target sizing and keyboard-operable controls.
- Client-side enhancement of existing server-rendered routes.
- Reduced motion and prevention of page-level horizontal overflow.

### Refactoring allowed for interface delivery

- Extracting or consolidating Astro components.
- Reorganising CSS without changing domain behaviour.
- Small view-model or formatting helpers that do not alter persisted data.
- Reusing existing endpoints and mutations from a clearer interface.
- Adding unit, contract or browser tests for changed presentation and journeys.

## Hard database boundary

PR #84 must not include:

- New, removed or altered database tables, columns, constraints or indexes.
- SQL migration files or edits to existing migrations.
- Data backfills, repair scripts or persistence-format conversions.
- Changed identifier semantics or relationships between persisted records.
- New queries whose purpose is to introduce a new product capability disguised
  as an interface change.
- Changes that require a deployment-time migration or manual database action.

If an interface idea requires any of these, stop that iteration and document it
as a separate future feature. Do not weaken the boundary to keep the rapid loop
moving.

## Existing behaviour to preserve

- Booking, offer, payment and cancellation lifecycle rules.
- Manual operational intervention in the current booking process.
- Booker and administrator access controls.
- Planner owner, editor, contributor and viewer permissions.
- Optimistic concurrency, revisions and activity attribution.
- Local Guide publication, contribution and moderation rules.
- Private credentials, reservation notes and sanitized sharing boundaries.
- External-AI capability and proposal approval restrictions.
- Calendar availability and override semantics.
- Existing URL stability unless a URL change is explicitly reviewed.

## Accessibility and responsive baseline

- Use semantic headings, links, buttons, forms and disclosure controls.
- Maintain keyboard access and visible focus.
- Do not communicate state through colour alone.
- Keep phone form controls at 16px or larger and interactive targets at least
  44px where practical.
- Respect reduced-motion preferences.
- Keep server-rendered content usable if client JavaScript fails.
- Avoid document-level horizontal overflow at 320px, 375px and 430px.
- Retain meaningful labels and announcements for assistive technology.

## Out of scope

- Database or migration work of any kind.
- New booking, payment, planner or Local Guide domain capabilities.
- Rewriting existing authorization or mutation services.
- Deployment automation or production activation.
- Changes to the manual operational controls around bookings.
- Broad dependency upgrades unrelated to an accepted interface iteration.
- Large architectural rewrites that delay visual feedback.

## Acceptance criteria

- Every included change has a visible interface purpose.
- The accepted experience works at representative phone and desktop widths.
- Existing server-side permissions and domain behaviour remain unchanged.
- No migration or database-definition file is added or modified.
- No changed code requires a database operation during deployment.
- Forms remain recoverable and understandable after validation or conflict
  failures.
- Keyboard, screen-reader and touch use do not regress on changed journeys.
- Existing private, print and sanitized-share boundaries remain intact.
- The local Docker HTTPS deployment builds and serves the accepted interface.
- Focused contracts cover durable interaction or responsive behaviour added by
  the PR.

## Validation

Run validation in proportion to each iteration, then run the complete gate
before PR #84 is merged:

- Focused tests for the templates, components or helpers changed.
- `npm run test:booking-lifecycle`.
- `npm run test:booking-integration` when a changed journey touches existing
  server mutations or persistence reads.
- `npm run check`.
- `npm run build`.
- Local Docker rebuild and HTTPS acceptance.
- Phone-width checks at 320px, 375px and 430px.
- Desktop regression checks on each materially changed page.
- `git diff --check` and an explicit confirmation that `db/` is unchanged.

## Delivery sequence

1. Start `agent/rapid-interface-changes-no-db` from the latest `development`.
2. Iterate rapidly through the local HTTPS deployment.
3. Commit accepted interface checkpoints to the feature branch.
4. Push the branch and open PR #84 against `development`.
5. Run the complete validation gate and review the aggregate diff.
6. Merge only when the interface is accepted and the no-database-change
   boundary has been confirmed.
7. Delete the completed feature branch.
