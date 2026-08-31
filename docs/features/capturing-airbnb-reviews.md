# Capturing and publishing Airbnb reviews

**Status:** Completed on 31 August 2026

## Outcome

The repository now has a privacy-separated workflow for capturing Airbnb
reviews as verified PDFs, retaining complete evidence in a private canonical
manifest, deriving sanitised public datasets and presenting written reviews and
aggregate ratings on the landing page.

The completed baseline contains 52 reviews with 52 unique Airbnb review IDs and
public texts. Every review has an overall rating, stay metadata and all six
detailed-rating categories. Twenty-three reviews also contain private host
feedback.

## Privacy and repository boundary

Raw PDFs and the canonical manifest can contain names, exact dates, review IDs,
private notes, individual category ratings and feedback. These paths are
therefore ignored by Git and must never be imported by the website:

```text
docs/source-material/airbnb/reviews/
output/pdf/airbnb-reviews/
```

Commands must not print review bodies, private notes, photographs or full
Airbnb URLs during normal operation. Only these deliberately limited artifacts
are public and versioned:

```text
site/src/data/public-reviews.json
site/src/data/public-review-summary.json
```

They exclude exact dates, review IDs, PDF filenames, private feedback,
per-review detailed ratings, category feedback, photographs and profile links.

## Capture process completed

The complete list was opened in an existing signed-in Chrome session. The
Chrome-control connection was used to expand all 52 reviews, open each review by
its semantic button, wait for a populated dialog and `reviewId=` URL, capture
all sections, and close the dialog before continuing. Reviews were identified
by Airbnb review ID, never by guest name alone.

Each review received a dedicated clean HTML print view and was printed through
Chrome's `Page.printToPDF` capability. Filenames contain the sequence, guest slug
and review ID, for example:

```text
01-fred-1763706679522933548.pdf
```

The print tab was explicitly navigated to each review's own HTML before every
print, preventing stale content from being repeated. The batch was accepted only
after confirming 52 unique IDs and 52 unique extracted PDF texts. The complete
browser procedure is recorded in
`docs/airbnb-review-chrome-pdf-workflow.md`.

## PDF verification

All 52 generated PDFs were verified as single-page A4 documents with `pdfinfo`,
rendered with `pdftoppm` and visually inspected for clipping, overlap, blank
continuations and missing sections. Each PDF was checked for its expected ID,
guest, public text and six rating headings. Four-star values were also checked
for truthful star rendering. Temporary HTML, extracted text and render files
were removed after acceptance.

## Canonical private manifest

The ignored canonical dataset is generated at:

```text
docs/source-material/airbnb/reviews/private-review-manifest.json
```

Its committed schema is
`docs/source-material/airbnb/private-review-manifest.schema.json`. Each record
contains source identity and capture metadata, reviewer and listing data, exact
validated stay dates, public text and rating, optional private feedback, and the
ordered Check-in, Cleanliness, Accuracy, Communication, Location and Value
ratings with deduplicated feedback tags.

Generation validates the manifest against its schema. Identical repeated
captures with the same ID collapse to one record; conflicting captures stop for
manual review. Feedback tags are deduplicated case-insensitively while retaining
first-seen order.

Visible stay dates must be real and agree with the displayed duration.
December-to-January stays are handled explicitly. The March 2025 Steven source,
whose old filename stated three nights while its dates span two, is correctly
stored as a two-night stay.

## Sanitised public reviews

`site/src/data/public-reviews.json` contains 52 approved records ordered from
the most recent stay to the earliest: 50 five-star and two four-star reviews.
Each record contains only a stable public ID, overall rating, approved quote,
display name, generalised stay, listing label, source label and approval data.

`site/src/lib/public-reviews.ts` rejects unsupported versions, duplicate IDs,
invalid values, unapproved content, HTML and missing or additional fields.
Public text extraction stops at `Note from`, `Only visible to you and Airbnb`,
`Write a public reply` or `Detailed ratings`.

## Aggregate public ratings

`site/src/data/public-review-summary.json` exposes only the review count,
five-point scale, overall average and six category averages:

| Measure | Score |
| --- | ---: |
| Overall | 4.96 |
| Check-in | 5.00 |
| Cleanliness | 4.96 |
| Accuracy | 5.00 |
| Communication | 4.98 |
| Location | 5.00 |
| Value | 4.90 |

The independently validated summary contains no guest identity, guest-level
score, feedback, private note, review ID, PDF reference or exact stay date.

## Landing-page presentation

`What our guests say` now contains an accessible written-review carousel and an
`At a glance` aggregate panel. The carousel provides previous/next controls,
keyboard arrows, pointer swiping, a live count and sentence-boundary
`More…`/`Less` expansion.

The second panel presents the 4.96 overall score, all six category averages and
proportional bars. It sits beside the carousel on desktop and below it on smaller
screens. The design was informed by the supplied Airbnb overall, detailed and
qualitative-rating references without copying platform badges, photographs or
guest-level evidence. Desktop, tablet and phone checks found no horizontal
overflow.

## Commands

Unnormalised Airbnb exports can first be checked and renamed:

```text
cd site
npm run reviews:rename -- --year YYYY
npm run reviews:rename -- --year YYYY --apply
```

The command is dry-run by default, validates visible metadata, never overwrites
a target and leaves ambiguous or unsupported material unchanged.

Verified clean PDFs produce the private manifest and both public projections:

```text
cd site
npm run reviews:generate-datasets -- --approved-at YYYY-MM-DD
npm run test:reviews
node --experimental-strip-types --test tests/booking-lifecycle/public-reviews.test.ts
npm run build
```

Existing public reviews retain their approval dates. The supplied date applies
to new public records and the regenerated aggregate summary.

## Implemented files

- `site/scripts/rename-airbnb-reviews.mjs`
- `site/scripts/generate-airbnb-review-datasets.mjs`
- `site/scripts/generate-public-airbnb-reviews.mjs`
- `site/tests/reviews/*.test.mjs`
- `docs/source-material/airbnb/private-review-manifest.schema.json`
- `site/src/lib/public-reviews.ts`
- `site/src/data/public-reviews.json`
- `site/src/data/public-review-summary.json`
- `site/src/components/PublicReviewCarousel.astro`
- `site/src/pages/index.astro`

## Acceptance evidence

- 52 canonical records, 52 unique review IDs and 52 unique public texts.
- All 312 expected detailed-rating cells are present.
- Twenty-three private notes remain confined to ignored storage.
- No duplicate feedback-tag groups remain.
- Public artifacts contain no prohibited private fields.
- Review extraction and landing-page contract tests pass.
- The production build and `git diff --check` pass.
- Desktop, tablet and phone browser inspection found no overflow.

## Legal and editorial qualification

Public visibility on Airbnb does not itself make a review anonymous or grant an
unrestricted right to republish it. A first name combined with text and timing
can remain personal data, and the reviewer may retain rights in their words.

Public records therefore remain explicitly curated and approved. Photographs,
profile links, review URLs and IDs, host-only feedback, individual category
ratings, exact dates and incidental private details remain prohibited. Removed
or withdrawn reviews require deliberate reconciliation.

Relevant guidance:

- [Airbnb: Reviews for homes](https://www.airbnb.co.uk/help/article/13)
- [Airbnb: Terms of Service for European users](https://www.airbnb.co.uk/help/article/2908)
- [ICO: What is personal data?](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/personal-information-what-is-it/what-is-personal-data/what-is-personal-data/)
- [ICO: Personal data obtained from publicly accessible sources](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/what-common-issues-might-come-up-in-practice/)

## Follow-on boundary

This completed feature establishes the 52-review baseline. It does not yet
detect, capture and reconcile future reviews as an incremental operating
process. That work is defined in
`epics/e03-f00-extending-the-capture-of-new-reviews-to-enrich-the-private-review-manifest.md`.
