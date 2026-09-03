# E06-F04 — Financial Breakdown Import and Reconciliation

## Status

Complete.

## Parent epic

[`E06 — Storing Exported Airbnb Data`](../epics/e06-f00-storing-exported-airbnb-data.md)

## Objective

Convert the captured **You earn** and **Guest paid** panels into queryable,
ordered financial summaries and line items without losing Airbnb's displayed
text.

## Scope

- Parse currency and totals using integer minor units.
- Import both `host_earnings` and `guest_paid` perspectives.
- Parse nightly charges, per-night child rows, discounts/adjustments, Airbnb
  host service fees, guest service fees and totals.
- Support signed amounts, quantities, unit prices and optional service dates.
- Preserve unknown future line types as classified `other` rows with raw text.
- Store the complete raw panel text for lossless review.
- Compare the reservation headline total with the host total.
- Validate arithmetic when the displayed hierarchy is sufficiently explicit;
  otherwise record that arithmetic was not determinable.

## Tests

- Flat nightly pricing and different prices by night.
- Negative nightly adjustments and percentage/VAT fee descriptions.
- Guest quantity multiplied by unit price.
- Currency parsing, decimal precision and signed minor-unit conversion.
- Unknown line descriptions and nested row ordering.
- Headline agreement, explainable discrepancy and malformed-total rejection.

## Acceptance criteria

1. Every qualifying reservation has exactly two financial summaries.
2. Captured totals round-trip to their original displayed currency value.
3. Negative adjustments retain their sign.
4. Line ordering and parent/child relationships reproduce the source panel.
5. Every headline/host discrepancy is either resolved or explicitly flagged.
6. No financial value appears in ordinary import logs.

## Delivered implementation

- Extended the private booking parser to produce host-earnings and guest-paid
  summaries with integer GBP minor units.
- Stored ordered accommodation, nightly, adjustment, service-fee, total and
  fallback rows, including dated parent-child relationships, signed values,
  quantities and unit prices.
- Preserved each panel's complete displayed text and rejected conflicting
  financial evidence on repeated or duplicate captures.
- Reconciled top-level arithmetic and the reservation headline host total,
  recording a difference only where evidence disagrees.
- Kept financial amounts out of routine command output.

## Validation

- All 89 reservations have exactly two summaries: 89 `host_earnings` and 89
  `guest_paid`.
- All 178 summaries reconcile as `verified` against 933 ordered line items.
- The imported hierarchy contains 353 child rows and preserves 256 negative
  adjustments or fees.
- Focused tests cover signed fees, dated adjustment children, quantities, unit
  prices, both perspectives and arithmetic verification.
- An unchanged rerun added no source documents or reservations and matched all
  103 captures without duplicating financial rows.
