# Proposed PR — Stage 2.6: Guest Local Guide contribution consent

## Objective

Let a guest explicitly offer one recommendation from their private plan to Olrig Bank for later administrator review.

## Scope

- Offer only custom items originally added by the consenting Booker or participant.
- Require an unchecked consent control and record the consent wording/version and timestamp.
- Record an explicit attribution preference and snapshot the chosen attribution name when permitted.
- Snapshot only the selected item's offered title, description and location.
- Let the submitting guest withdraw a pending contribution without erasing its audit record.
- Keep candidate records private and pending; do not create or update Local Guide content.
- Add consent and withdrawal events to plan revision history.

## Acceptance criteria

- Existing Local Guide references, copied content and another participant's items cannot be offered.
- Consent is item-specific, explicit and inactive by default.
- Candidate persistence contains no booking credential or unrelated plan content.
- A pending candidate cannot be submitted twice.
- Only the original submitter can withdraw their pending candidate.
- No candidate becomes public without the separate administrator moderation increment.

## Out of scope

- Administrator moderation and publication.
- Editing submitted candidate snapshots.
- Guest comments and proposal approval.
- External AI access.
