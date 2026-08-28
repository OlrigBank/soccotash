# Proposed PR #98 — Public Internal Discovery Links

## Status

- Parent branch: `agent/getting-olrig-bank-to-go-viral-epic`
- Feature branch: `agent/pr-98-public-internal-discovery`
- Intended merge target: `agent/getting-olrig-bank-to-go-viral-epic`
- Depends on: PR #97
- Database changes: none expected

## Objective

Make Olrig Bank and The Cottage at Olrig Bank easy for visitors and crawlers to discover from
the public site through contextual, descriptive links.

## Implementation

1. Add a visible home-page link to Olrig Bank using natural wording such as
   `large group and family holiday house in Kendal`.
2. Add a corresponding descriptive Cottage-at-Olrig-Bank link without implying inaccessible,
   luxury or secure-garden features.
3. Improve the listings-index heading, description and link context while
   keeping accommodation names intact.
4. Add restrained contextual links from relevant public Local Guide or contact
   content where they assist a guest journey.
5. Confirm every important public listing has at least one standard `<a href>`
   link from another indexable page.
6. Ensure mobile navigation exposes the same important destinations as desktop.

## Acceptance criteria

1. Olrig Bank is reachable from the home page without JavaScript.
2. Link text remains meaningful when read without surrounding UI.
3. Exact-match phrases are not repeated mechanically across the site.
4. No private booking, planner or administration URL is made indexable.
5. Internal links resolve with the site's trailing-slash convention.
6. Navigation and link contract tests pass.

## Out of scope

- External backlinks, directories or paid promotion.
- Search-engine submission.
- Creating speculative landing pages.
