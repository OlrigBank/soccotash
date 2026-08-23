# Proposed PR #101 — Verified Vacation-Rental Structured Data

## Status

- Parent branch: `agent/getting-olrig-bank-to-go-viral-epic`
- Feature branch: `agent/pr-101-vacation-rental-structured-data`
- Intended merge target: `agent/getting-olrig-bank-to-go-viral-epic`
- Depends on: PR #96 and PR #99
- Database changes: none expected

## Objective

Expose verified Olrig Bank listing facts as machine-readable JSON-LD without
inventing amenities, publishing private information or promising eligibility
for a Google rich result.

## Implementation

1. Select the appropriate Schema.org type, initially evaluating
   `VacationRental` with an `Accommodation`/entire-place representation.
2. Serialize only verified facts shared with the visible listing:
   - name and description;
   - canonical URL;
   - public images;
   - Kendal/Cumbria/UK locality information at the approved disclosure level;
   - occupancy;
   - bedroom and bathroom counts; and
   - explicitly verified amenities.
3. Derive structured values from listing data rather than maintaining a second
   contradictory hard-coded description.
4. Escape JSON safely inside the HTML script element.
5. Do not add aggregate rating or individual review data until publication
   rights, visible presentation and platform rules are separately approved.
6. Document Google's additional vacation-rental and Hotel Center eligibility
   requirements.

## Acceptance criteria

1. JSON-LD parses as valid JSON and validates against the selected vocabulary.
2. Structured facts agree with the visible Olrig Bank page.
3. No email address, phone number, exact private data or booking token leaks.
4. No rating, review, accessibility or secure-garden claim is invented.
5. Absolute URLs use the production canonical origin.
6. Serialization and factual-consistency tests pass.

## Out of scope

- Hotel Center integration.
- Review rich-result markup.
- Guaranteeing enhanced search presentation.

## Eligibility boundary

Schema.org markup does not by itself make these pages eligible for Google's
vacation-rental presentation. Google's current documentation also requires an
eligible Hotel Center integration, precise latitude and longitude, and at
least eight qualifying photographs covering bedrooms, bathrooms and common
areas. The site does not currently hold approved coordinates, so this feature
must not invent them or claim eligibility. Those external requirements should
be revisited only when verified data and the appropriate Google programme
access are available.
