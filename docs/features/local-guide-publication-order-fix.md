# Local guide publication ordering fix

Publishing a category reorder could fail with PostgreSQL error `23505` on
`local_guide_categories_published_sibling_position_idx`. The published positions
were replaced in one update, but the non-deferrable partial unique index checks
rows individually. A valid swap could therefore collide with an old sibling
position before the other row was updated.

Publication now clears the published category fields, then copies the working
category fields, inside the existing locked transaction. Readers continue to
see the previous committed publication until commit. Any later failure rolls
back the category fields, publication records, entries and published version.
The unique indexes remain in place. No schema migration or data repair is needed.

## Verification

- The PostgreSQL integration regression failed before the fix with the exact
  published-sibling-position constraint error. It passes with the fix, covering
  swaps in both directions, reuse of a deleted published category's position,
  draft/public separation and rollback after an injected later publication error.
- All 91 booking lifecycle test files pass. Astro check has zero errors/warnings
  and two existing admin hints. The production build passes.
- Chrome DevTools inspected the rebuilt admin workspace in a disposable local
  schema with a generated administrator session. Publishing a reordered draft
  advanced the displayed published version from 1 to 2. At 390 × 844,
  768 × 1024 and 1440 × 900 there was no document overflow; no console errors or
  warnings appeared. The existing native Publish button and confirmation were
  exercised. No new UI pattern or layout change is introduced.

The live database and customer's draft were not modified. Rebuild the running
application container to use the corrected code, then retry the existing draft's
publication. No deployment or live publication was performed during verification.
