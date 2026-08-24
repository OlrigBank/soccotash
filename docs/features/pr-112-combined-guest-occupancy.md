# Proposed PR #112 — Combined Guest Occupancy Threshold

## Status

- Parent branch: `development`
- Feature branch: `agent/pr-112-combined-guest-occupancy`
- Intended merge target: `development`
- Current status: implemented and verified; ready for review
- Database changes: yes
- Public interface changes: occupancy assessment only

## Problem

Adults and children are both guests, but the original occupancy evaluator only
compares each category with its own threshold. A policy allowing 8 adults and 7
children therefore incorrectly classifies 8 adults plus 3 children as standard,
because neither independent category threshold is exceeded.

## Objective

Add a combined guest threshold, calculated as `adults + children`, while
retaining the individual adult and child thresholds and keeping infants
separate.

## Implementation

1. Add `guests` to the closed set of occupancy-rule subjects.
2. Backfill every existing policy's guest rule from its adult rule so deployed
   drafts and published policies acquire a safe combined threshold.
3. Evaluate the guest rule using the derived adult-plus-child count.
4. Expose **Guests (adults + children)** in the occupancy policy editor.
5. Include the combined guest threshold in booking assessment metadata and
   plain-language assessment reasons.
6. Extend unit and PostgreSQL integration coverage for combined parties.

## Acceptance criteria

- A policy with a maximum of 8 guests classifies 8 adults plus 3 children as
  bespoke when its exceed outcome is bespoke.
- A party at or below all combined and category thresholds remains standard.
- Infants do not contribute to the guest count.
- Existing adult, child, infant, pet and service-animal rules retain their
  behaviour.
- Existing policies gain a guest rule without losing their other configured
  values or lifecycle state.

## Out of scope

- Deciding whether infants should contribute to a future absolute capacity.
- Changing the review-and-offer booking workflow.
- Automatically publishing an occupancy policy.

## Implemented outcome

- Migration `052_combined_guest_occupancy.sql` extends the closed rule set and
  backfills a guest rule from every existing adult rule.
- The shared evaluator derives guests as adults plus children. Infants remain a
  separately assessed category.
- The administration workspace presents **Guests (adults + children)** as an
  explicit, editable rule and requires all six rules before publication.
- Public quotation guidance describes the combined guest allowance when a
  published policy supplies one.
- Unit and database regressions cover an 8-adult, 3-child party exceeding an
  8-guest standard maximum and verify upgrade backfill behavior.

## Verification

- Booking lifecycle tests: 60 passed.
- PostgreSQL integration tests: 19 passed.
- Astro check: passed with no errors.
- Production build: passed.
- `git diff --check`: passed.
