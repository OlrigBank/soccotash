# Public pricing and period modelling

Implemented in `site/db/007_public_pricing_and_scenarios.sql`.

## Public booking quote

`POST /api/quote/` validates availability and evaluates the current published plan for a direct, flexible booking. The public response contains guest-facing accommodation, discounts, fees and total, but never exposes owner commission or owner-revenue calculations.

`POST /api/provisional-bookings/` repeats the calculation server-side and stores a snapshot with the request. This makes the submitted record independent of later plan edits or publication changes.

A listing with no published pricing plan remains enquiry-only and is marked for manual price confirmation.

The untouched migration-004 plan named **Olrig Bank — example baseline** is archived automatically by migration `007`. This prevents demonstration prices from becoming public merely because the quote connection was deployed. A real plan must be reviewed and explicitly published. Any genuinely published administrator-created plan is left unchanged.

## Administration

- Rule builder: `/admin/pricing/`
- Reusable cards: `/admin/pricing/rule-cards/`
- Month/season models: `/admin/pricing/models/`
- Provisional requests and recorded quotes: `/admin/bookings/`

## Scenario exports

Saved runs can be exported from the models page in:

- CSV, organised into assumptions, summary, channels and monthly sections;
- JSON, containing the complete saved scenario input and result.

The model uses stored availability blocks. Occupancy, average stay, cancellations, booking lead and channel mix are administrator assumptions and must not be presented as historical facts or AI predictions.
