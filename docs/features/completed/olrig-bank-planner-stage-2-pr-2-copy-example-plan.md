# Proposed PR — Stage 2.2: Copy a published example plan

## Objective

Allow an administrator or authorised Booker to populate an empty booking-linked
planner from a published Olrig Bank example without retaining a live dependency
on the example.

## Scope

- Offer only currently published, public and non-archived examples.
- Deep-copy ordered days and visible items with new identifiers in one transaction.
- Map copied days sequentially onto the booked stay and reject examples that are too long.
- Reset copied items to private-plan `idea` state and participant visibility.
- Preserve custom descriptions, timing, location and stable Local Guide references.
- Exclude private example items and reservation notes.
- Require an empty destination and its current revision.
- Record an actor-attributed planner revision and booking activity.
- Expose the action on administrator and private Booker booking pages.

## Acceptance criteria

- Either authorised surface can copy a published example into an empty booking plan.
- The copy has fresh day and item identifiers and dates aligned to the booking.
- Later changes or unpublication of the source do not alter the booking plan.
- Draft, unpublished and archived examples cannot be copied.
- Mismatched Booker credentials, stale revisions and non-empty destinations are rejected.
- Private item content and reservation notes do not enter the guest plan.

## Out of scope

- Selecting individual days or items.
- Merging into a non-empty plan.
- Booker editing and participant invitations.
