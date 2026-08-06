# Proposed feature — Stage 7: Guest contribution integration

## Status

- Epic: [Local Guide Database Migration](./epics/local-guide-database-migration-epic.md)
- Base and merge target: `agent/local-guide-db-migration-epic`
- Feature branch: `agent/local-guide-stage-7-contributions`
- Completion: test, merge locally into the epic branch, recheck, then delete this feature branch
- Implementation: complete
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

## Implementation record

- Added stable resulting Local Guide entry and revision relationships, plus category capture for new-entry drafts.
- Migration 037 reconciles accepted slug-only candidates into private drafts or contribution-authored working revisions and blocks unresolved/colliding results atomically.
- New moderation acceptance creates exactly one private draft or proposed working revision in the same transaction as the candidate decision and planner audit revision.
- Immutable revision metadata retains candidate ID, consent wording/version/time and recorded attribution preference/name; moderation history links directly to the resulting editorial record.
- Suggested updates preserve the currently published revision until an administrator separately publishes the proposed working revision.
- Rejected, withdrawn and already-decided candidates cannot create or change Local Guide content.

## Verification record

- Planner integration covers new drafts, suggested updates, private publication state, attribution provenance, duplicate suppression, rejection and withdrawal.
- `npm run test:booking-lifecycle`: 36 passed.
- `npm run test:booking-integration` with PostgreSQL and `TZ=UTC`: 10 passed.
- `npm run check` and `npm run build`: passed.
- Local Docker deployment is healthy and applied migration `037_local_guide_contribution_results.sql` successfully.
