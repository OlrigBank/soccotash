# Proposed PR #102 — Search Console Release and Measurement

## Status

- Parent branch: `agent/getting-olrig-bank-to-go-viral-epic`
- Feature branch: `agent/pr-102-search-console-measurement`
- Intended merge target: `agent/getting-olrig-bank-to-go-viral-epic`
- Depends on: PR #96–#101
- Database changes: none expected
- External action: authorised Google Search Console access will be required

## Objective

Verify the complete epic in production, submit its canonical public inventory
to Google and establish a repeatable evidence record for later improvements.

## Implementation

1. Add a release runbook covering production HTML, canonical, metadata,
   structured-data, sitemap and robots checks.
2. Verify the preferred `https://olrigbank.co.uk` property and relevant domain
   ownership in Google Search Console.
3. Submit the production sitemap.
4. Inspect and request indexing for the home, listings index, Main House and
   Cottage pages.
5. Record deployment date, inspected URLs and initial coverage state without
   storing account credentials in the repository.
6. Define a periodic report containing:
   - impressions;
   - clicks;
   - click-through rate;
   - average position;
   - queries and landing pages; and
   - listing-to-availability or contact conversion signals available from
     privacy-respecting site analytics.
7. Establish a minimum observation period before making large copy changes.
8. Turn proven opportunities into new feature documents rather than silently
   expanding this epic.

## Acceptance criteria

1. The production release checklist passes for all epic outputs.
2. The production sitemap is accepted or any actionable error is documented.
3. Main House URL inspection sees the intended canonical and rendered content.
4. The measurement template records a reproducible baseline.
5. No Search Console credentials, tokens or exports containing private data are
   committed.
6. The epic's full automated and regression test suites pass before merge to
   `development`.

## Out of scope

- Promised ranking or traffic outcomes.
- Paid search advertising.
- Automated changes based solely on position fluctuations.
- Keyword landing pages unsupported by measured intent.
