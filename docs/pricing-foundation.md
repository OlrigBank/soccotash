# Pricing management foundation

The protected administration area at `/admin/pricing/` now contains the first deterministic pricing implementation.

## What is implemented

- PostgreSQL-backed pricing plans with `draft`, `published`, and `archived` states.
- Version numbers and an optional relationship to the plan from which a draft was copied.
- Reusable pricing rule cards.
- Drag-and-drop rule ordering, with an accessible **Add** button alternative.
- Rule enable/disable controls, priority, stacking groups, and stackable/non-stackable behaviour.
- Rule editing without requiring the administrator to edit JSON.
- Single-booking simulation.
- Full explanation of rules that applied and rules that were skipped.
- Comparison of a selected draft with the currently published plan.
- Publishing that archives the previous published plan.
- Administration audit records and simulation logs.

The public booking page does **not** consume published prices yet. This deliberately allows the rule model to be tested before it affects guest-facing quotes.

## Database migration

Migration `site/db/004_pricing_foundation.sql` creates:

- `pricing_plans`
- `pricing_rules`
- `pricing_simulation_log`

It also creates two example plans for `main-house`:

- `Olrig Bank — example baseline` (published)
- `Olrig Bank — example summer proposal` (draft)

These example plans are modelling data only. They do not change the price on the public website.

## Supported rule cards

- Default nightly price
- Weekend adjustment
- Seasonal adjustment
- Date override
- Minimum stay
- Maximum stay
- Allowed arrival days
- Allowed departure days
- Fixed stay package with fee inclusions
- Price floor
- Length-of-stay discount
- Early-booking discount
- Last-minute discount
- Extra-guest charge
- Cleaning fee
- Pet charge
- Channel commission
- Non-refundable discount

## Calculation behaviour

Rules are evaluated in their visible plan order. Priority provides a secondary order when two records share a position.

Restrictions are checked before pricing. The calculation then builds accommodation pricing, discounts, fees, and channel commission. The output distinguishes:

- accommodation price;
- fees;
- guest total;
- channel commission;
- estimated owner revenue;
- average nightly accommodation price.

Date overrides replace the amount for matching nights. Weekend and seasonal percentage rules adjust matching nights. Discount rules reduce the current accommodation subtotal. Cleaning and pet rules add fees. Channel commission affects owner revenue but not the guest total.

## Stacking

A rule can have a stacking group such as:

- `seasonal-price`
- `booking-window-discount`
- `length-of-stay-discount`
- `channel-commission`

When a non-stackable rule in a group has already applied, a later conflicting rule in the same group is skipped and the simulator explains why.

## Creating plans for other listings

Select the Cottage or Whole-property listing and choose **Create first draft**. Add a default nightly price before publishing. A plan cannot be published unless it has an enabled default nightly price.

## Implementation status

The original five pricing-foundation recommendations are now implemented:

1. arrival/departure restrictions and maximum stays — migration `006`;
2. package inclusions — migration `006`;
3. price floors and conflict warnings — migration `006`;
4. published pricing in the public quote and provisional-booking flow — migration `007`;
5. month/season modelling and exportable reports — migration `007`.

## Reusable custom rule cards

Administrators can now open **Pricing → Manage rule cards** at:

```text
/admin/pricing/rule-cards/
```

A custom rule card is a reusable preset built on one of the deterministic calculation behaviours already supported by the pricing engine. Examples include:

- Christmas nightly override;
- August uplift;
- direct-booking discount;
- three-night New Year package;
- Booking.com commission;
- dog charge per pet.

For each card, an administrator can define:

- the card name and description shown in the library;
- its library category;
- the underlying calculation behaviour;
- the default rule name;
- priority, enabled state and stacking behaviour;
- applicable dates, nights, booking window or channel;
- amount, percentage, guest, pet and day-of-week defaults as relevant.

Active custom cards appear at the top of the rule library on the main pricing screen. They can be added using the button or by dragging them into a draft plan.

Custom definitions can be edited, archived and restored. Editing or archiving a definition does not retroactively alter rule instances already copied into a pricing plan. This keeps draft and published plans deterministic and auditable.

Migration `site/db/005_pricing_rule_definitions.sql` adds:

- `pricing_rule_definitions`;
- `pricing_rules.rule_definition_id`.

The link from a plan rule to its source definition is retained for traceability, while the rule itself stores a complete copy of the values used at the time it was added.

## Stay restrictions, package inclusions and price safeguards

Migration `site/db/006_pricing_restrictions_packages_floors.sql` extends the pricing foundation with the first three previously recommended safeguards.

### Arrival, departure and maximum-stay rules

The rule library and reusable-card editor now include:

- **Allowed arrival days** — restrict check-in to selected weekdays, optionally within a date range.
- **Allowed departure days** — restrict check-out to selected weekdays, optionally within a date range.
- **Maximum stay** — reject a booking above a configured number of nights, optionally within a date range.

These are evaluated with minimum-stay rules before a price is offered. The simulator marks a booking as **Restricted** and explains the failed rule.

### Fixed-package inclusions

A fixed package can now specify that its total includes:

- cleaning;
- the pet charge.

Fee rules are evaluated after package selection. When an inclusion is enabled, the corresponding separate fee is skipped and the rule explanation states that it is already included. This prevents the same charge being collected twice even when the fee card appears earlier in the visible rule order.

### Price floors

A **Price floor** card can enforce either:

- a minimum amount per night; or
- a minimum amount for the whole stay.

The highest matching floor is applied after packages and discounts but before fees and channel commission. When a floor raises a price, the simulator adds an itemised adjustment and a warning.

### Explicit conflict checks

The pricing screen now checks the complete plan and displays error, warning and information messages for combinations including:

- multiple enabled default prices;
- overlapping date overrides;
- overlapping packages for the same stay length;
- a minimum stay above a maximum stay;
- arrival or departure rules with no common allowed weekday;
- a package that violates minimum- or maximum-stay rules;
- duplicate cleaning fees;
- package-included fees that would otherwise be added separately;
- overlapping price floors;
- a fixed package below an applicable price floor.

Plans with error-level conflicts cannot be published. Warning and information messages remain visible for review but do not prevent publication.


## Published public quotes and provisional booking snapshots

The public booking form now asks for dates, guests and pets before calculating a direct-booking quote. The calculation uses only the listing's current **published** pricing plan. Draft and archived plans cannot affect a public quote.

The public flow operates in this order:

1. validate the listing, dates and party size;
2. check current calendar blocks and pending/approved provisional requests;
3. run the published pricing plan with the `direct` channel and flexible rate plan;
4. display the itemised guest-facing price;
5. recalculate on the server when the request is submitted;
6. save the plan version, pricing input and complete result as a booking snapshot.

The browser total is therefore informative rather than authoritative. A changed or manipulated browser value is never written as the booking price.

Listings without a published pricing plan continue to accept provisional enquiries. The public form states that Jenna will confirm the price manually, and the booking is stored without a pricing snapshot.

The untouched migration-004 plan named **Olrig Bank — example baseline** is archived automatically by migration `007`. This prevents demonstration prices from becoming public merely because the quote connection was deployed. A real plan must be reviewed and explicitly published. Any genuinely published administrator-created plan is left unchanged.

Administrators can review recent provisional requests and their recorded totals at:

```text
/admin/bookings/
```

Migration `site/db/007_public_pricing_and_scenarios.sql` adds quote fields to `provisional_bookings`, including the pricing-plan version, accommodation, fees, guest total, commission, owner revenue, complete input/result JSON and quote timestamp.

## Month and season modelling

Open:

```text
/admin/pricing/models/
```

A model can use any saved pricing plan, including a draft for comparison work. It combines that plan with actual stored calendar blocks and explicit assumptions for:

- model start and end dates;
- occupancy;
- average stay length, including decimal averages such as 4.2 nights;
- cancellation rate;
- average booking lead time;
- typical guests and pets;
- cancellation plan;
- direct, Airbnb and Booking.com channel mix.

The channel percentages must total 100%. Prices are evaluated for each channel and weighted by that mix. Channel commission changes owner revenue but not guest revenue.

Outputs include:

- period, blocked and available nights;
- target and modelled booked nights;
- expected occupied nights after cancellations;
- modelled booking count;
- gross and expected guest revenue;
- expected channel commission and owner revenue;
- average daily rate;
- revenue per available night;
- one- and two-night availability gaps;
- channel breakdown;
- monthly breakdown.

Scenario runs are saved in `pricing_scenario_runs`. Each run can be downloaded as CSV for spreadsheet analysis or JSON for machine-readable archival and integration.

Forecast figures are explicitly assumption-based. Published rule calculations and calendar blocks are deterministic inputs; occupancy, cancellations, lead time and channel mix are not predictions derived from historical booking behaviour.

## Sensible later enhancements

Further pricing work can build on this foundation by adding scenario-to-scenario comparison, cleaning-cost rather than cleaning-income assumptions, payment schedules, booking approval/status controls, and historical demand forecasting once enough direct-booking data exists.
