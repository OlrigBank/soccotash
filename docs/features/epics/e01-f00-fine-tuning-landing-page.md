# E01 — Fine-tuning the Landing Page

## Status

Active.

## Epic summary

Improve the public landing page as a focused direct-booking journey. Begin by
making the opening Quick Check smaller, clearer and more useful, then refine
the sections that follow it so the page presents the right information in the
right order without repeating booking prompts.

This epic builds on the existing availability, occupancy, pricing and request
journey. It does not introduce instant confirmation, payment or a second
booking engine.

## Desired outcome

A visitor arriving on a phone can understand the proposition, define dates
and party composition, receive a suggested stay arrangement and continue to a
request with minimal scrolling and no repeated data entry. The content that
follows Quick Check should then help the visitor decide and proceed, rather
than restating choices already made by the search.

## Experience principles

- Put the booking decision before long introductory copy.
- Keep the photographic identity of Olrig Bank visible.
- Use compact controls that disclose detail only when the visitor needs it.
- Ask visitors for dates and party composition before suggesting an
  arrangement.
- Keep suggestions provisional and distinguish them from confirmed quotes.
- Preserve entered state when continuing into the complete request journey.
- Avoid duplicate booking panels, calls to action and explanatory content.
- Retain accessible labels, keyboard operation and useful touch targets.

## Feature sequence

### E01-F01 — Booking-first hero and compact Quick Check — Completed

[Feature record](../e01-f01.md)

Implemented the first stage of the epic:

- moved Quick Check into the photographic homepage hero;
- replaced the long opening paragraph with concise booking-focused copy;
- removed the duplicate standalone homepage panel;
- combined check-in and check-out into one compact date control;
- condensed party composition into a guest summary with an expandable
  plus/minus selector for adults, children, infants and pets;
- removed the up-front stay-arrangement selector;
- derived and displayed a **Suggested Stay arrangement** after the check;
- grouped the suggested arrangement, estimated total, provisional-price note
  and continuation action in one result card; and
- shortened the host-priced response so it supports the next action without
  repeating internal review detail.

### Later features — Content following Quick Check

The next features should review and reshape the sections after the hero. Their
scope is intentionally not fixed by E01-F01. Candidate work includes:

- deciding what should immediately follow a successful or incomplete check;
- reducing duplication between the suggested arrangement and **Ways to stay**;
- improving the hierarchy and amount of accommodation-detail content;
- reviewing the role and placement of the featured local guide; and
- tightening mobile page length while preserving useful discovery content.

Each follow-on feature must define its own content goal, acceptance criteria
and browser-review widths before implementation.

## Epic-level constraints

- The server remains authoritative for availability, occupancy and pricing.
- A Quick Check does not reserve dates or confirm a booking.
- The full `/book/` journey remains responsible for contact details, detailed
  occupancy information and request creation.
- Listing-page panels must continue to work with their fixed arrangements.
- Homepage-only presentation changes must not change listing-panel behavior.
- Existing public routes, analytics events and continuation parameters remain
  supported.

## Validation baseline

Every feature in this epic should include, in proportion to its scope:

- `npm run check`;
- a production Docker build;
- `git diff --check`;
- browser inspection at 390×844, 768×1024 and 1440×900 when layout changes;
- keyboard and touch review for new controls; and
- checks for horizontal overflow and browser-console errors introduced by the
  application.
