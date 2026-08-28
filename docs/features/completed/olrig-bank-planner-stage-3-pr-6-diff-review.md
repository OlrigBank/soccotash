# Proposed PR — Stage 3.6: Diff and review interface

## Objective

Let authorised guests understand a pending external-AI proposal without allowing it to change the living plan.

## Scope

- List stored proposals in Booker and editor workspaces.
- Compare each proposal against the current authoritative plan.
- Classify additions, changes, moves, removals and semantic conflicts.
- Flag proposals whose source revision is no longer current.
- Detect missing identifiers, invalid day/order targets, private items and booked items.
- Provide authenticated, non-cacheable review routes with no mutation controls.

## Out of scope

- Accepting, editing, partially accepting or rejecting proposals.
- Applying any operation to the live plan.
- Final rate limiting and audit hardening.
