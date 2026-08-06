# Proposed feature — Stage 7: Guest contribution integration

## Status

- Epic: [Local Guide Database Migration](./epics/local-guide-database-migration-epic.md)
- Depends on: [Stage 6](./local-guide-stage-6-administration.md)
- Enables: moderated guest recommendations entering the editorial workflow

## Objective

Connect accepted guest contributions to database drafts and proposed working revisions without allowing moderation to publish content.

## Scope

- Add stable resulting entry and revision relationships to contribution candidates.
- Reconcile existing accepted slug-based candidate results.
- Create exactly one private draft for an accepted new-entry contribution.
- Create exactly one proposed working revision for an accepted update.
- Show current and proposed content and allow an administrator to edit, apply or reject the proposal.
- Preserve submitted content, consent wording/version/time, attribution preference, attribution name, moderation decision and editorial changes.
- Link contribution and planner history to the resulting entry or revision.
- Enforce transactional idempotency and separate publication authorisation.

## Acceptance criteria

- Acceptance creates one draft or proposed revision and never publishes it.
- Duplicate decisions cannot create duplicate content.
- Withdrawn and rejected candidates cannot alter the guide.
- Existing accepted candidates are reconciled without losing audit data.
- Attribution follows the immutable recorded preference.
- A resulting entry becomes selectable only after separate publication.

## Tests

- New-entry, suggested-update and existing-candidate migration tests.
- Duplicate suppression, rejection and withdrawal tests.
- Consent, attribution, permissions and audit tests.
- Separate-publication browser workflow test.

## Out of scope

- Automatic publication or guest editing of published content.
- Guest-facing moderation notifications.

