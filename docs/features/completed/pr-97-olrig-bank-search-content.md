# Proposed PR #97 — Olrig Bank Search-Intent Content and FAQ

## Status

- Parent branch: `agent/getting-olrig-bank-to-go-viral-epic`
- Feature branch: `agent/pr-97-olrig-bank-search-content`
- Intended merge target: `agent/getting-olrig-bank-to-go-viral-epic`
- Depends on: PR #96
- Database changes: none expected

## Objective

Replace Olrig Bank's minimal listing copy with accurate, immediately visible
content that answers guest questions and naturally expresses the agreed search
proposition.

## Implementation

1. Add the epic's agreed sections to the internally named `main-house.md` listing:
   - spacious group accommodation in Kendal;
   - walking into Kendal and exploring the Lake District;
   - large garden and off-road parking; and
   - design for families and groups.
2. Add the five visible questions and answers covering occupancy, walking into
   Kendal, parking, family suitability and the Lake District base.
3. Verify every fact against the listing configuration and current operation.
4. Keep driveway limitations and bedroom-arrangement qualifications visible.
5. Render the FAQ semantically with headings and ordinary visible text. Do not
   hide the only copy inside client-only controls.
6. Improve the hero image alternative text so it describes the image rather
   than repeating the page title, where the image content supports that text.

## Acceptance criteria

1. The complete agreed copy is present in server-rendered HTML.
2. The page reads naturally without a freestanding keyword list.
3. Occupancy, bedroom, bathroom, parking and garden claims are consistent.
4. The page is usable at 320px and at desktop widths.
5. Heading hierarchy is valid and contains a single `h1`.
6. Content contract tests protect the important guest facts and disclaimers.

## Out of scope

- New keyword-specific landing pages.
- Review publication or rating markup.
- The Cottage at Olrig Bank long-form SEO content beyond existing accurate links.
