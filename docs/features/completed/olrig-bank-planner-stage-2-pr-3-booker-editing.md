# Proposed PR — Stage 2.3: Booker editing workflow

## Objective

Give the Booker a complete private, non-AI workflow for maintaining the
booking-linked holiday plan.

## Scope

- Add a dedicated planner workspace under the existing private booking credential.
- Authorize every mutation against the credential's internal booking identity.
- Allow the owner to edit the plan title and summary.
- Add, edit, remove and keyboard-reorder dated plan days within the booked stay.
- Add, edit, remove, move and keyboard-reorder custom and Local Guide-backed items.
- Enforce item lifecycle transitions, date/time validation and payload limits server-side.
- Apply optimistic revision checks and return visible stale-write conflicts.
- Attribute successful revisions to the Booker without storing or logging the access token.
- Keep reservation notes private and the entire workspace non-indexed and non-cacheable.

## Acceptance criteria

- The Booker can maintain days and activities entirely within Olrig Bank.
- A credential cannot read or mutate another booking's plan by substituting identifiers.
- Local Guide references remain linked rather than copied.
- Invalid transitions, dates, times and stale revisions do not partially change the plan.
- Every meaningful change creates one guest-attributed revision.
- All ordering controls are keyboard operable.

## Out of scope

- Additional participants and invitations.
- Contributor proposals and comments.
- Local Guide contribution consent.
- Public or token-independent sharing.
