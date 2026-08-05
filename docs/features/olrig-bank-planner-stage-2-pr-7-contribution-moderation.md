# Proposed PR — Stage 2.7: Administrator contribution moderation

## Objective

Give authenticated administrators a private queue for reviewing consented Local Guide contributions and recording a durable outcome.

## Scope

- List pending candidates from their consented snapshots without opening the private guest plan.
- Let an administrator edit the proposed title, summary and location before accepting.
- Accept a candidate as either a new Local Guide entry draft or a suggested update to an existing entry.
- Reject a candidate with a required moderation reason.
- Link accepted results to a validated Local Guide slug and keep them non-public drafts.
- Record administrator, decision time, notes and the resulting reviewed content.
- Add moderation decisions to the originating plan's revision history.

## Acceptance criteria

- Only authenticated administrators can read or mutate the moderation queue.
- Review uses only the candidate snapshot, consent and attribution fields—not the wider private plan.
- Every candidate can receive one terminal accept/reject decision.
- Existing-entry suggestions reference a real Local Guide entry.
- New-entry draft slugs cannot collide with an existing or accepted entry.
- Acceptance does not write source Markdown or publish guest content automatically.
- Rejection and acceptance decisions retain an administrator-attributed audit trail.

## Out of scope

- Publishing accepted drafts into the source-controlled Local Guide.
- Editing existing Local Guide Markdown from the runtime application.
- Guest-facing moderation notifications.
- External AI access.
