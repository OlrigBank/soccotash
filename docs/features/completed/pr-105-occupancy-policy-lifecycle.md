# Proposed PR #105 — Occupancy Policy Lifecycle and Modelling

## Status

- Parent branch: `agent/managing-occupancy-epic`
- Feature branch: `agent/pr-105-occupancy-policy-lifecycle`
- Intended merge target: `agent/managing-occupancy-epic`
- Current status: implemented and verified; ready for review
- Database changes: yes
- Public interface changes: none

## Objective

Give administrators versioned occupancy policies that can be drafted, modelled
and published using the lifecycle already established for pricing plans.

## Implementation

1. Add occupancy policies with `draft`, `published` and `archived` states,
   versions, authorship, publication metadata and an optional source policy.
2. Enforce at most one published policy per stay arrangement.
3. Add a closed set of server-supported rules for adult, child, infant, pet and
   service-animal conditions.
4. Implement deterministic assessment outcomes of `standard`, `bespoke` and
   `host_decision_required`, with stable reason codes and Booker-safe wording.
5. Allow administrators to create a blank draft or duplicate any policy.
6. Make published and archived policies read-only.
7. Provide a modelling form that evaluates example parties without creating a
   booking.
8. Publish atomically, archive the previous version and record an audit event
   after explicit confirmation.
9. Seed reviewable draft policies; do not silently invent unresolved child,
   infant, pet or service-animal rules.

## Acceptance criteria

- Draft changes cannot affect live booking assessment.
- Modelling and live assessment use the same evaluator.
- Publishing activates one complete version atomically.
- The former published policy becomes archived and remains readable.
- Rule validation and lifecycle permissions are enforced server-side.
- No administrator-authored executable expressions can be stored or run.

## Out of scope

- Changing the public booking form.
- Automatically accepting standard bookings.
- Allocating rooms or Cottage resources.

## Implemented outcome

- Migration `047_occupancy_policy_lifecycle.sql` adds versioned policies,
  closed rule records and policy lifecycle events, together with intentionally
  incomplete review drafts for all four current stay arrangements.
- The supported rule subjects are adults, children, infants, pets and service
  animals. Each rule defines a non-negative standard threshold and either a
  bespoke or host-decision outcome when exceeded.
- The deterministic evaluator produces stable reason codes and Booker-safe
  explanations. Missing rules remain unresolved rather than inventing policy.
- Administrators can create or duplicate drafts, maintain rules, model example
  parties and publish only a complete five-rule policy.
- Publication atomically archives the former published policy. Published and
  archived versions are read-only.
- The authenticated, same-origin occupancy workspace is available from the
  administration navigation and requires confirmation before publication.

## Verification

- Booking lifecycle tests: 56 passed.
- PostgreSQL integration tests: 15 passed, including policy creation, rule
  completion, modelling, publication, immutability, duplication and archival.
- Astro check: passed with no errors.
- Production build: passed.
- `git diff --check`: passed.
