# Database-backed public reviews — local acceptance

The homepage now reads approved public snapshots from PostgreSQL on each request.
Review imports remain private until explicitly published. Publishing and unpublishing
changes both the carousel and six-category summary on the next visit, without a build.
The homepage uses `Cache-Control: no-store`; a database or validation failure shows
an empty review section rather than falling back to stale bundled approvals.

## Publication controls

**Website publication panel** is a custom admin composition of native HTML forms,
buttons, a public preview and a saved-status message. It lives on each imported
review's detail page. The existing **Guest review carousel** is a custom pattern
whose visual design and keyboard navigation are retained.

The public projection contains only display name, public text, rating, stay month,
year and nights, property label, source label and approval date. Six numerical
category ratings contribute to the public summary. Private feedback, tags, source
paths, booking information and conversations are excluded. Strict allowlist
validation runs before publishing and before rendering. Publication snapshots
preserve previously approved wording independently of later source captures.

Mutations require an authenticated administrator and the existing same-origin
check. Parent-row locking and a submitted revision reject stale decisions.
Publication changes and the historical seed are audited. Importing never creates
a publication automatically. Invalid public content or incomplete category ratings
prevents new publication, while unpublishing remains available.

## Primary local result

- Backed up the primary `soccotash.public` database before the migration:
  `backups/before-public-review-publication-1790692718642.dump` (private, mode 0600;
  archive contents checked).
- Applied only `067_airbnb_public_reviews.sql`. Unrelated migration 065 was not applied.
- Parsed all 52 original review PDFs and checked their public projections against
  the existing approved JSON. Checked individual category scores against the bundled
  summary before making changes.
- Imported 51 historical reviews missing from the DB. One of the five September
  captures already represented a historical review and retained its imported evidence.
- Stored the exact approved public snapshot and ratings for all 52 historic reviews.
- Final state: 56 imported reviews, 52 published, four unpublished. Overall score 4.96.
- Rerunning the seed imported and published nothing. It never overwrites existing
  publication records, including subsequent unpublish decisions.
- Development and production were not deployed or modified.

## Local review

A review-only preview is available at `http://localhost:8081/`; the existing Docker
site remains at port 8080. Sign in normally at
`http://localhost:8081/admin/login/?returnTo=/admin/airbnb/reviews/` and open a review
to publish or unpublish it. This preview uses the primary local database, so these
publication decisions persist. Other mutating routes are blocked and notification
credentials are removed from its environment. It is not a booking-flow preview.

To restart with a local DATABASE_URL supplied securely in the environment:

```sh
npm run build
node site/scripts/preview-airbnb-publication.mjs
```

For another environment, first back up its DB and apply migration 067. From a trusted
checkout with the original private PDFs and manifest available, run
`node --experimental-strip-types site/scripts/seed-approved-airbnb-reviews.mjs`
with that environment's DATABASE_URL. Verify the public count and summary after
the post-deployment import. Reviews may be temporarily absent until seeding finishes. The seed is an explicit preparation step, not a
startup hook; the private evidence is not shipped in the runtime image. The JSON
files remain as historical seed inputs and are no longer imported by the homepage.
Do not approve newly imported reviews implicitly during deployment.

## Verification

- `npm run check`: zero errors and warnings; two pre-existing hints in admin login
  and local-guide code.
- `npm run build`: passed.
- Historical seed integration test: exact 52-review payload equality and category
  averages; rerun preserves an unpublish decision; audit record checked; prohibited
  fields in stored public JSON rejected. Disposable PostgreSQL schema.
- Publication Playwright test: empty state; publish; live count and ratings; private
  feedback/source identity exclusion; unpublish; anonymous and cross-site rejection;
  malformed action and stale revision rejection; keyboard form operation. Passed.
- Existing admin review date Playwright regression: passed.
- Chrome DevTools on rebuilt fixture application: 390×844, 768×1024 and 1440×900;
  native keyboard submission, public preview, publication success, empty state,
  focus outline, accessible button names, no page overflow or console errors.
  Relevant document, script and stylesheet requests returned 200.
- Chrome DevTools on primary preview: 52 cards, 4.96 summary, phone/tablet/desktop
  overflow checks and ArrowRight carousel navigation passed; no console errors.
- Lighthouse admin publication page: accessibility 100, best practices 100,
  agentic browsing 100; SEO 80 from existing missing admin description.
- Lighthouse homepage: accessibility 96, best practices/SEO/agentic browsing 100.
  The sole accessibility failure is pre-existing footer paragraph contrast (2.4:1),
  outside the review component. No new review accessibility failures.

Browser mutations used disposable guests and administrators; no real customer was
contacted. Primary-data checks were read-only after the authorised migration.

## Follow-up: duplicated rating tokens

Airbnb's newer capture includes both the accessible `5 stars` and visible `5`.
The parser previously consumed only the former, leaking the latter into the quote
and each category's feedback. `displayedRating` now consumes the paired tokens for
both overall and category ratings, rejects mismatched scores, and preserves review
prose starting with numbers. It accepts star-icon headings and numeric-only scores.
Four-star overall and category scores are covered by regression tests.

On primary local, backed up to
`backups/before-review-rating-repair-1790694431114.dump` before the bounded repair.
`repair-airbnb-review-ratings.mjs` verifies captured dialog text and exact imported
evidence, repairs only duplicated rating tokens, and audits each changed review.
It defaults to a transaction that rolls back; `--apply` commits explicitly.
Five imported reviews were repaired, four published snapshots corrected and 30
spurious category feedback tokens removed. The older approved snapshot already
had clean wording. Publication state, ratings, original JSON, PDFs, hashes and
source raw_extraction were preserved. Rerunning reported zero changes.

All five saved captures have overall 5; Anna's check-in category is 4. No rating
was inferred from the earnings screenshot. The site currently shows 56 published
reviews following the owner's publication decisions. DevTools confirmed clean
quotes for all four new reviews and correct four-filled/one-empty star rendering
for the two historical four-star reviews. At 390×844, 768×1024 and 1440×900 there
was no page overflow, numerical quote prefix or console error. No UI pattern or
layout changed. Capture tests: 21 passed; repair integration test: passed, including
rollback-only preflight, preservation of four-star scores and immutable evidence,
publication correction, tampered-input rejection and idempotency. No rebuild or
external deployment was required for the database correction.

## PR preparation

Added a dedicated Airbnb capture/publication CI workflow using synthetic guests and
a disposable PostgreSQL service. The historical 52-PDF seed test runs in the owner
checkout and explicitly skips when private historical evidence is absent in CI.
Updated the existing homepage source regression and the public-browser CI server
to use a disposable database containing approved review fixtures. No private
capture, database dump, encryption key, or run artifact belongs in the PR.

Pre-PR check/build passed (two existing hints), all 26 capture/review tests passed,
three Airbnb database integration tests passed, and four public-review unit tests
passed. Prior DevTools/Lighthouse evidence above covers the unchanged application
UI. Development currently differs only by its merge commit; branch synchronisation
must preserve unrelated owner document edits.

The owner confirmed migrations are applied only by deployment: merge into
development, wait for deployment/migrations, then import September, repair rating
tokens, seed historical approvals, reconcile and verify. The homepage can show an
empty review section until seeding finishes. Existing target imports require
overlap inspection. Repeat via main only after development acceptance.

The updated homepage browser regression passed 29 tests at 320×800, 390×844,
768×1024 and 1440×900; three desktop-only cases were appropriately skipped on
smaller viewports. CI used the rebuilt app and synthetic database fixture.


## CI correction

The first fresh-runner check exposed database-wide extensions being installed in
one disposable schema. The fixture helper now serialises extension setup and
installs pgcrypto and btree_gist in public before creating test schemas. Existing
migrations remain unchanged. The homepage now imports its allowlisted read-only
query from public-review-repository; admin mutation functions remain separate and
the existing public/admin security-boundary test is retained.

Validation of the CI correction: all 273 lifecycle unit tests passed; Astro check
and build passed with the same two existing hints. The previously failing browser
and repair tests and three import/reconciliation integration tests passed against
a newly created local database with no preinstalled extensions. A permanent
regression verifies simultaneous schema creation and extension availability after
one fixture is dropped. No application schema migration or customer data changed.
