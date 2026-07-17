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
- Fixed stay package
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

## Recommended next implementation

1. Add arrival/departure-day restrictions and maximum-stay rules.
2. Add package inclusion options, especially whether cleaning is included.
3. Add price floors and explicit conflict warnings.
4. Connect published pricing to the public quote/provisional-booking flow.
5. Add month/season modelling and exportable reports.

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
