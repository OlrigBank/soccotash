# Managing Occupancy

## Status

Complete. See [completion evidence](../managing-occupancy-epic-completion.md).

## Purpose

Allow Olrig Bank to understand and manage the composition of each booking party,
apply the correct accommodation rules and optionally record the people and pets
expected to stay without collecting unnecessary personal information.

The epic distinguishes three related concepts:

- **Booker** — the person responsible for the booking. The Booker’s name remains
  required.
- **Occupancy** — the number of adults, children, infants and pets included in
  the stay.
- **Named occupants** — the individual people expected to stay. Apart from the
  Booker, occupant names are optional.

Holiday Planner participants are collaborators on a plan. They are not the
booking’s occupancy record and must not be counted as occupants automatically.

## Occupancy categories

The proposed categories are determined by each occupant’s age on the arrival
date:

- **Adults:** age 13 or over.
- **Children:** ages 2–12.
- **Infants:** under 2.
- **Pets:** recorded separately.

The booking journey should request category counts. It should not require dates
of birth.

At least one adult must be included in a booking request.

## Occupant names

The Booker’s name is required as part of the booking contact information.

Names for every other adult, child or infant are optional. A Booker may add,
edit or remove these names when they are useful for arrival preparation, room
planning or identifying who is expected at the property. An unnamed occupant
still contributes to the relevant occupancy count.

Recording an occupant must not:

- give that person access to the booking;
- make that person a Holiday Planner participant;
- require their email address or telephone number; or
- imply that they are authorised to make decisions for the booking.

The initial booking request must remain possible using category counts and the
required Booker details alone. Optional occupant details may be completed later
through the private booking workspace.

## Accommodation capacity

Capacity rules must belong to the selected stay arrangement rather than use one
universal maximum-guest rule.

The currently agreed public descriptions are:

- **Olrig Bank:** sleeps 8 adults.
- **Olrig Bank Max:** sleeps 12 adults.
- **The Cottage at Olrig Bank:** sleeps 4 adults.

These are standard published arrangements rather than absolute limits on what
the host may offer. In all cases, additional children may potentially be
accommodated by agreement. A larger or otherwise exceptional party becomes a
bespoke request for host review; exceeding a standard capacity must not cause an
automatic rejection.

A bespoke arrangement may use a host-selected combination of Olrig Bank, the
rear bedrooms, bathroom, WC and landing used by Olrig Bank Max, other available
parts of the Cottage, and explicitly agreed alternative sleeping arrangements.
Only the host decides whether the requested party can be accommodated safely and
appropriately.

## Pets

The booking must retain a pet count and allow the type of pet to be identified,
for example dog, cat or other. A short optional description should accommodate
unusual cases without requiring a large classification system.

When pets are selected, the initial request requires:

- the number of pets; and
- a species for each pet, using dog, cat or other with a short description.

Approximate size or weight and breed are optional unless a published occupancy
rule specifically requires further information. Individual pet records permit a
mixed group, such as two dogs and one cat, to be represented accurately.

The booking journey must ask whether any animal is a service animal and record
that answer separately. The precise policy treatment of service animals must be
agreed before the pet rules are published; they must not be hidden within the
generic `other` category.

The occupancy summary may include guidance such as:

> Parties bringing more than 2 pets require confirmation from Olrig Bank.

Whether two pets is an automatic allowance or simply the point at which extra
discussion is requested remains to be confirmed.

## Standard and bespoke occupancy

Every submitted party is assessed against the published occupancy policy for
the selected stay arrangement. The assessment produces:

- **standard** — the party fits the published arrangement without a special
  agreement;
- **bespoke** — the party may be accommodated but requires the host to agree a
  combination of spaces or another exception; or
- **host decision required** — no automated policy can promise the requested
  arrangement, but the request remains available for the host to assess.

The evaluator must return plain-language reasons as well as an outcome. Reasons
may include additional children, a standard adult capacity being exceeded, the
pet threshold being exceeded or a non-standard sleeping arrangement being
needed.

At present, every booking submission remains subject to administrator review
and an offer. This epic does not remove that behaviour. It records whether the
occupancy is standard or bespoke so that a future feature can allow standard
bookings to follow a more direct route while bespoke bookings continue through
conversation and a tailored offer.

Anything that requires agreement with the host while the booking is being made
makes the booking bespoke.

## Occupancy summary

The booking journey must present the selected party composition in plain
language before submission. The wording must reflect the selected stay
arrangement and must not imply that a non-standard arrangement is confirmed
before administrator review.

For example:

> Olrig Bank sleeps up to 8 adults. Your party includes 6 adults, 3 children and
> 1 infant. This arrangement will be confirmed with you before booking.

Pet guidance should be shown separately and only when relevant.

For a bespoke assessment, suitable wording is:

> This party requires a bespoke booking arrangement. Submit your request and
> Olrig Bank will confirm how it can be accommodated.

## Occupancy policy lifecycle

Occupancy policies use the established pricing-plan lifecycle:

```text
Draft → Published → Archived
```

- Policies are scoped and versioned by stay arrangement.
- An administrator can create a blank draft or duplicate an existing policy.
- Draft policies and rules are editable and can be modelled against example
  parties without affecting booking requests.
- Only one policy can be published for a stay arrangement at a time.
- Publishing a complete draft atomically archives the previously published
  policy and activates the new version.
- Published and archived policies are read-only. Further changes begin in a new
  draft.
- Publishing requires explicit administrator confirmation and is audited.
- Every booking snapshots the policy ID, version, input, outcome and reasons
  used at submission. Later policy changes do not reinterpret that booking.

Occupancy rules differ from price rules in their result: they classify a party
and explain why rather than calculate money. Initial rule types should remain a
small, closed set sufficient for adult, child, infant, pet and service-animal
policy. New rule types require server-side support and tests rather than
administrator-authored executable expressions.

## Bespoke accommodation allocation

The original requested occupancy remains unchanged when the host constructs a
bespoke offer. The offer separately records the rooms, facilities and approved
sleeping arrangements being supplied.

Spaces that affect independent availability must be selectable underlying
resources rather than offer prose alone. Accepting a bespoke offer must reserve
every resource used by the offered arrangement and prevent a conflicting offer
or booking. In particular, using parts of the Cottage must prevent an
incompatible independent Cottage booking for the same dates.

This epic introduces the resource and allocation foundation needed for bespoke
offers. It does not require every descriptive amenity to become a separately
bookable resource: only a space whose allocation affects capacity,
availability or conflicts needs that treatment.

## Existing data migration

There are currently no real bookings whose historical party composition must be
preserved.

During migration, the existing `provisional_bookings.guests` value for every
booking will map to the number of adults:

- `adults = guests`;
- `children = 0`;
- `infants = 0`; and
- the existing `pets` count is retained.

This is an explicit one-time migration assumption. The migration must be
repeatable in the project’s normal migration workflow and must leave existing
development and test booking records readable.

After migration, any retained aggregate guest total must have one documented
meaning and be derived consistently from the category counts. Pricing,
capacity, emails and booking displays must not use different interpretations of
the same total.

## Proposed implementation route

### 1. Define occupancy policy

Document the adult, child, infant and pet rules for each stay arrangement,
including which combinations require administrator confirmation.

Implement versioned draft, published and archived occupancy policies using the
same lifecycle principles as pricing plans. Provide draft modelling, explicit
publication, audit history and immutable booking snapshots.

### 2. Introduce the occupancy data model

Add adult, child and infant counts and the minimum data needed for optional
named occupants and pet details. Apply database constraints for non-negative
counts and at least one adult.

Migrate existing guest totals to adult counts using the rule in this epic.

### 3. Update booking requests

Replace the single **Guests** input with accessible controls for adults,
children and infants. Retain pet count and add appropriate pet-type details.
Show the contextual occupancy summary before the request is submitted.

### 4. Preserve pricing and booking compatibility

Update pricing inputs, quotations, offers, emails, booking summaries,
availability requests and validations to use the newly defined counts. Ensure
the selected stay arrangement supplies the relevant capacity policy.

### 5. Add private occupant management

Allow the Booker to maintain optional occupant names from the private booking
workspace. Count and named-record changes must remain consistent and
recoverable.

### 6. Add administrator oversight and policy management

Show party composition, optional occupant details, pet information, incomplete
details and capacity warnings in booking administration. Administrators must be
able to assess exceptional arrangements without the software silently changing
an agreed party. Administrators can create, duplicate, model and publish
occupancy policies without a deployment.

### 7. Add bespoke accommodation allocation

Represent availability-affecting spaces as resources, allow the host to build a
bespoke offered arrangement and protect those resources from conflicting use.

### 8. Complete privacy and lifecycle handling

Keep occupant details out of public pages, shared itineraries, search indexes,
analytics and AI representations. Include them in existing access-control,
audit and booking-deletion behaviour.

### 9. Extend regression coverage

Cover public request submission, pricing, offers, emails, private Booker access,
administrator views, migration, historic test bookings, deletion and capacity
edge cases.

## Acceptance criteria

- The Booker can enter adult, child and infant counts independently.
- The categories are based on age at arrival.
- A booking request contains at least one adult.
- The Booker’s name is required.
- Every other occupant name is optional.
- Unnamed occupants still contribute to the correct occupancy count.
- Occupants do not automatically receive booking or Planner access.
- Capacity guidance depends on the selected stay arrangement.
- Exceeding a standard published capacity routes the request to bespoke review
  rather than automatically rejecting it.
- Anything requiring agreement with the host is classified as bespoke.
- All submissions continue through the existing review-and-offer flow until a
  separate future feature changes standard booking behaviour.
- Pet count is retained and pet type can be recorded.
- Mixed pet groups and service-animal identification can be represented.
- Existing `guests` values migrate to adult counts without losing existing pet
  counts.
- Administrators can create, duplicate and model draft occupancy policies.
- Publishing a policy atomically archives the previous published version.
- Published and archived policy versions are read-only.
- A booking retains an immutable snapshot of its occupancy assessment.
- A bespoke offer records its accommodation allocation separately from the
  requested occupancy.
- Accepting a bespoke offer protects every allocated availability resource from
  conflicting use.
- Pricing, quotations, offers, messages and booking displays use consistent
  occupancy meanings.
- Occupant information remains private and follows the booking’s retention and
  deletion lifecycle.
- Relevant changes are auditable.
- Existing booking and regression tests are updated and continue to pass.

## Matters still to agree

- The precise child and infant allowances for each stay arrangement.
- Whether infants contribute to any operational or absolute occupancy limit.
- The Cottage’s adult, child and infant capacity rules.
- Whether two pets is an accepted default or merely a communication threshold.
- The exact treatment of service animals within occupancy and pet policies.
- Whether optional occupant names should become requested or required at a
  later booking status.
- Whether room or sleeping-arrangement notes belong to each occupant or to the
  booking as a whole.
- The initial inventory of availability-affecting spaces available for bespoke
  allocation.
- Production policy values for the remaining operational thresholds must be
  agreed before those policies are published.

## Out of scope

- Automatically accepting or confirming a standard booking.
- Removing administrator review or the current offer step.
- Guaranteeing that every bespoke request can be accommodated.
- Treating Planner participation as proof of occupancy.
- Collecting dates of birth or contact details for every occupant.
- Allowing administrators to create executable rule code through the policy
  editor.

## Proposed PR sequence

1. [PR 104 — Occupancy foundation and data migration](../pr-104-occupancy-foundation-and-migration.md)
2. [PR 105 — Occupancy policy lifecycle and modelling](../pr-105-occupancy-policy-lifecycle.md)
3. [PR 106 — Booking party capture and assessment](../pr-106-booking-party-capture.md)
4. [PR 107 — Booking lifecycle and pricing compatibility](../pr-107-occupancy-booking-compatibility.md)
5. [PR 108 — Optional occupants and pet details](../pr-108-optional-occupants-and-pets.md)
6. [PR 109 — Bespoke accommodation resource model](../pr-109-bespoke-accommodation-resources.md)
7. [PR 110 — Bespoke offer allocation and conflicts](../pr-110-bespoke-offer-allocation.md)
8. [PR 111 — Occupancy privacy, regression and epic completion](../pr-111-occupancy-regression-and-completion.md)
