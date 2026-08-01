# Property, resources and bespoke event bookings

Olrig Bank is the managed property. Main House, Cottage and grounds are
availability resources. Main House stay, Cottage stay and Olrig Bank stay are
predefined booking arrangements that retain the existing pricing plans.

## Event enquiry lifecycle

An event submission creates one normal booking with `booking_kind = event` and
the existing `pending` status. It receives the same private link, conversation,
offer, payment and notification records as a stay. The submitted wording is
stored in immutable `original_submission`; administrators edit separate working
details.

A raw event enquiry has no resource allocation and does not block availability.
An administrator must define resource periods and deliberately place a
time-limited hold. Publishing an offer changes those allocations to `offered`;
acceptance changes them to `accepted`; verified initial payment changes them to
`confirmed`. Decline, offer expiry or cancellation releases them.

Allocation periods are half open: `[start, end)`. Therefore one allocation may
start at the exact instant another ends. PostgreSQL's exclusion constraint is
the final race-safe protection against overlapping blocking allocations for the
same resource; application advisory locks provide orderly conflict messages.

## Offers and money

Tailored quotation lines store description, quantity, integer minor-unit unit
amount, calculated line total, category and display order. Publishing creates a
versioned offer with snapshots of the event details, resources and periods,
payment-plan rules/methods, terms and expiry. Database triggers prevent changing
the commercial or event snapshots of a published offer.

Manual bank transfer remains the only active payment method. GoCardless and
Stripe remain visible only as future stubs. The existing pricing-plan payment
rules determine the exact deposit and balance schedule on acceptance.

## Legacy compatibility

The legacy `property_id` remains readable as an arrangement key. Migration 018
maps `main-house`, `cottage` and `whole-property` explicitly and refuses unknown
values. Historical whole-property bookings retain the documented Main
House-only availability fallback because legacy records cannot prove Cottage or
grounds occupancy. New Olrig Bank stays allocate Main House, Cottage and grounds.
Imported Main House and Cottage calendars map directly to those resources.

All displayed event times are Olrig Bank local time (`Europe/London`) and are
stored as `timestamptz`.

