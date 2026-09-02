# E06-F04 — Financial Breakdown Import and Reconciliation

## Status

Proposed; depends on E06-F03.

## Parent epic

[`E06 — Storing Exported Airbnb Data`](epics/e06-f00-storing-exported-airbnb-data.md)

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
