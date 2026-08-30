# Capturing Airbnb review PDFs

**Status:** Completed

## Purpose

Provide a safe, repeatable command that identifies newly exported Airbnb review
PDFs in `docs/source-material/airbnb/reviews/` and renames them consistently.
The renamed PDFs remain private local source material for a later feature that
will produce deliberately anonymised, publishable reviews for the landing page.

## Privacy and repository policy

Raw Airbnb review PDFs can contain guest names and photographs, Airbnb review
identifiers, detailed ratings, and feedback marked as visible only to the host
and Airbnb. Derived source analysis can contain the same information.

The complete `docs/source-material/airbnb/reviews/` directory must therefore be
ignored by Git. Neither raw PDFs nor private derived analysis may be committed.
The later anonymisation feature must write reviewed, publishable output to a
different directory and must define its own privacy acceptance criteria.

The rename command must not print review bodies, private feedback, photographs,
or full Airbnb review URLs in normal output or error logs.

## Scope

This feature provides a manually invoked, local command. It is not a filesystem
watcher, Git hook, scheduled job, PDF importer, review publisher, or landing-page
change.

The command scans only PDF files in:

```text
docs/source-material/airbnb/reviews/
```

An initial filename may resemble:

```text
Andrew's Review - Airbnb.pdf
```

Unicode apostrophes and dash variants in exported filenames must also be
accepted.

## Evidence from the supplied PDFs

The required values appear visually near the top of an Airbnb review page:

1. reviewer heading, for example `Andrew's review`;
2. stay range, for example `24-27 August`;
3. displayed duration, for example `3 nights`; and
4. Airbnb listing title.

These are visual fields, not reliably the first lines returned by a plain PDF
text extractor. In the supplied Andrew PDF, ordinary text extraction omits the
stay range and duration. The implementation must use extraction that works on
the rendered region, such as positional extraction with an OCR fallback.

The visual stay range may omit its year. A PDF creation or print year is not
evidence of the stay year because older reviews can be exported later.

## Required year handling

The command must never silently infer a missing stay year from the current date,
file timestamps, PDF metadata, or surrounding filenames.

- If the PDF visibly supplies both years, use them.
- If the year is absent, require `--year YYYY`. This is the check-in year.
- If a yearless range crosses from December into January, the checkout year is
  the supplied check-in year plus one.
- If the year is absent and `--year` is not supplied, report the ambiguity and
  leave the file unchanged.★★★★★
"Ideal for a couple wanting to explore the Lakes. Compact but has everything. Close to Penrith for supplies."

— David

Example:

```text
Could not determine the stay year for "Andrew's Review - Airbnb.pdf".
No file was renamed. Re-run with --year 2026.
```

## Listing classification

The Airbnb listing title must be mapped to a stable filename label.

| Airbnb listing | Filename suffix |
| --- | --- |
| `Olrig Bank: Spacious, but cosy, with large garden` | no additional suffix |
| `Cosy Cottage, heart of Kendal, parking, big garden` | ` Cottage` after `Review` |

Older room-level listings and any unknown or newly renamed listing must not be
guessed. The command must report the unsupported title and leave the file
unchanged until an explicit mapping is added and tested.

## Canonical filenames

Use ASCII hyphens and this exact Main House format:

```text
YYYY-MM-DD-YYYY-MM-DD - N nights - Reviewer Review - Airbnb.pdf
```

For the Cottage, use:

```text
YYYY-MM-DD-YYYY-MM-DD - N nights - Reviewer Review Cottage - Airbnb.pdf
```

For example:

```text
2026-08-24-2026-08-27 - 3 nights - Andrew Review - Airbnb.pdf
```

Reviewer names must be taken from the visible heading, have possessive endings
removed, retain meaningful internal spaces and Unicode letters, and have only
characters unsafe in filenames removed or replaced. The implementation must not
attempt to anonymise the name; anonymisation belongs to the later feature.

## Validation rules

Before proposing a rename, the command must validate that:

1. reviewer name, stay range, duration, and a supported listing are present;
2. dates form real calendar dates and checkout is after check-in;
3. the calculated number of nights equals the displayed Airbnb duration;
4. the source is not already in canonical form; and
5. the target filename does not already exist.

The displayed duration and calculated duration must agree. Neither value silently
overrides the other. A disagreement is an error requiring manual review. This is
important because the existing source collection contains at least one filename
whose stated duration disagrees with its date range.

## Command behaviour

Expose the routine through a documented package command. The exact script name
may follow repository conventions, but its interface must support:

```text
npm run reviews:rename -- --year 2026
npm run reviews:rename -- --year 2026 --apply
```

Behaviour must be:

- dry-run by default;
- no filesystem changes unless `--apply` is present;
- process candidates in deterministic filename order;
- skip already canonical filenames;
- skip legacy date-prefixed review filenames already present in the source
  collection, rather than reprocessing historical material;
- never overwrite an existing file;
- rename atomically within the same directory;
- continue examining other files after a per-file failure;
- print one concise result per file and a final count of proposed, renamed,
  skipped, and failed files; and
- return a non-zero exit status if any candidate fails validation.

Corrupt, encrypted, unreadable, image-only without successful OCR, ambiguous, or
unsupported PDFs must remain unchanged and be counted as failures.

## Acceptance criteria

1. Raw review PDFs and private derived review analysis are ignored by Git.
2. A dry run proposes the Andrew filename shown above when invoked with
   `--year 2026`, without renaming the file.
3. The same command with `--apply` performs exactly that rename.
4. Omitting `--year` for a PDF that does not display a year leaves it unchanged
   and exits non-zero with an actionable message.
5. A December-to-January fixture assigns the checkout year correctly.
6. Main House and Cottage fixtures receive the correct canonical forms.
7. Unknown and older room-level listing fixtures are left unchanged.
8. A duration/date mismatch is left unchanged and reported for manual review.
9. An already canonical file is skipped idempotently.
10. An existing target collision never overwrites either file.
11. A corrupt or unreadable PDF does not prevent other candidates being checked.
12. Automated tests cover dry-run, apply, year handling, cross-year dates,
    listing mapping, Unicode names, dash variants, collision, idempotency,
    extraction failure, and duration mismatch.
13. Command output and test snapshots contain no review body, private feedback,
    guest photograph, or full Airbnb review URL.

## Proposed public-review inputs for stage two

Airbnb states that anyone can read a published public review and its overall star
rating. This distinguishes the public review surface from individual category
ratings and notes to the host, which are available only to the host and Airbnb.

Subject to the publication checks below, the next feature may take these fields
as candidate inputs:

- the reviewer's first name, for example `Andrew`;
- the public overall star rating, for example `5 stars`;
- the written public review text;
- the public Airbnb listing name; and
- a generalised description of the stay, for example `Stayed 3 nights in
  August`.

The next feature must never take these fields from the private or detailed-rating
parts of the PDF. Extraction must retain an explicit boundary between public and
host-only content.

### Publication qualification

Public visibility does not, by itself, make the material anonymous or grant an
unrestricted right to republish it on a separate commercial website:

- a first name combined with review text, listing, and stay timing may still
  identify or enable someone to single out the reviewer and therefore may remain
  personal data;
- information obtained from a publicly accessible source still requires an
  identified lawful basis and appropriate privacy information unless a relevant
  exception applies;
- the reviewer may hold rights in their written review, while Airbnb's current
  European terms restrict copying or displaying platform content unless the user
  owns it, has the content owner's permission, or another term or agreement
  authorises the use; and
- a review can later be removed from Airbnb, so the public dataset needs a
  withdrawal and periodic reconciliation policy.

Consequently, stage two must not label a record containing a first name and
verbatim review as anonymised merely because the source was public. Before
publication it must establish and record the content permission or other legal
basis relied upon, the UK GDPR lawful basis where personal data remains, and the
editorial approval decision.

If those publication checks are not satisfied, the safe fallback is to exclude
the first name and avoid verbatim review text, producing a genuinely anonymised
thematic summary that cannot reasonably be linked back to a reviewer.

The following fields remain prohibited for public output:

- guest photographs or profile links;
- full Airbnb review URLs or review identifiers;
- private notes or feedback visible only to the host and Airbnb;
- individual category ratings and category feedback;
- exact stay dates; and
- any personal detail found incidentally inside the review text unless it has
  been removed during editorial review.

### Stage-two data architecture

Stage two must keep private extraction records and public website content in two
separate data layers.

#### Private extraction manifest

The private manifest remains under the ignored
`docs/source-material/airbnb/reviews/` directory. It may contain the local PDF
reference, source review identifier, extraction result, public/private field
classification, publication assessment, and reconciliation state needed by the
owner. It must not be imported into the website build or committed to Git.

#### Curated public review data

Only reviewed and publication-approved fields are copied into the versioned
public dataset:

```text
site/src/data/public-reviews.json
```

The initial format is JSON because it is deterministic, directly importable by
Astro, straightforward to validate during builds, and does not permit executable
content. The file must contain a schema version and an ordered review array.

Example:

```json
{
  "schemaVersion": 1,
  "reviews": [
    {
      "id": "cottage-2026-08-david",
      "rating": 5,
      "quote": "Ideal for a couple wanting to explore the Lakes. Compact but has everything. Close to Penrith for supplies.",
      "reviewer": {
        "displayName": "David"
      },
      "stay": {
        "nights": 3,
        "month": "August",
        "year": 2026
      },
      "listing": {
        "key": "cottage",
        "displayName": "Cottage at Olrig Bank"
      },
      "source": {
        "displayName": "Airbnb guest review"
      },
      "publication": {
        "approved": true,
        "approvedAt": "2026-08-30"
      }
    }
  ]
}
```

The public dataset must not contain local PDF paths, Airbnb URLs or review IDs,
exact stay dates, private feedback, individual category ratings, photographs,
internal legal reasoning, or unapproved records.

Each `id` must be stable and unique. Array order is display order. Page numbers
and the total number of pages must not be stored; the interface derives them from
the current array index and `reviews.length`.

### Public data validation

The repository must provide an application-level schema or JSON Schema that
fails automated tests and the production build when public review data is
invalid. Validation must require:

- `schemaVersion` is a supported integer;
- every review ID is non-empty and unique;
- `rating` is an integer from 1 through 5;
- `quote` and all display labels are non-empty plain text;
- `nights` is a positive integer;
- `month` is a valid English month and `year` is a reasonable four-digit year;
- `listing.key` is from an explicit supported set;
- `publication.approved` is exactly `true`;
- `publication.approvedAt` is a valid ISO calendar date; and
- prohibited private or source-traceability fields are absent.

Review text must be rendered as text, not injected HTML. The extraction process
must preserve the approved public quote verbatim apart from deliberate editorial
corrections that are separately approved.

### Swipeable landing-page panel

The landing page will display one review per panel using this presentation:

```text
★★★★★
“Ideal for a couple wanting to explore the Lakes. Compact but has everything.
Close to Penrith for supplies.”

— David, 3-night stay · August 2026
Airbnb guest review

● ○ ○ ○ ○
1 of 5
```

The interface must:

- place the review section toward the end of the landing page, immediately above
  the site footer and its booking/contact navigation;
- expose a `Guest reviews` link in the desktop, mobile, and footer navigation;
- display one review at a time in public dataset order;
- order generated reviews by stay date from most recent to earliest;
- provide visible previous and next controls;
- support touch and pointer swiping without preventing normal vertical page
  scrolling;
- support keyboard navigation with the left and right arrow keys while the panel
  is focused;
- derive and display `current page of total pages`;
- show pagination dots for a small review set, with the current dot identified;
- expose the rating as accessible text such as `5 out of 5 stars`, rather than
  relying on star glyphs alone;
- announce review changes through a polite ARIA live region without repeatedly
  reading the complete carousel during ordinary page navigation;
- keep previous/next controls and page status correctly disabled or described
  when there are zero or one reviews;
- maintain a stable panel layout as review lengths change, without clipping text
  or causing avoidable page movement; and
- shorten long reviews only at a complete sentence boundary and provide an
  accessible `More…`/`Less` control that reveals or collapses the retained full
  public text;
- work without automatic advancement. If autoplay is proposed later, it requires
  a separate motion, pause, focus, and reduced-motion review.

The component must remain usable at 390x844, 768x1024, and 1440x900, without
horizontal page overflow. Browser verification must cover swiping, controls,
keyboard navigation, focus order, page count, console errors, failed requests,
and screenshots at all three sizes.

### Stage-two data and panel acceptance criteria

1. Private extraction data remains ignored and cannot enter the website build.
2. The versioned public JSON contains only approved display fields.
3. Invalid, duplicate, unapproved, or privacy-prohibited records fail validation.
4. The panel renders the rating, quotation, attribution, stay summary, listing
   context where required, and source label from the public dataset.
5. Previous, next, swipe, and keyboard interactions select the correct review.
6. Page count always reflects the selected array index and current dataset
   length; pagination dots are shown only when the dataset is small enough to
   remain useful.
7. Zero-review and one-review datasets produce useful, non-broken states.
8. Rating and page changes have appropriate accessible names and announcements.
9. Review content is rendered as plain text and cannot inject HTML.
10. Responsive and browser checks pass at all three required viewport sizes.
11. Every PDF in the private review directory contributes one validated record
    to the generated public dataset; generation fails if any filename or safe
    public-text region cannot be parsed.
12. The review section is above the landing-page footer, its menu link resolves
    to the section, and long-review expansion works with pointer and keyboard
    interaction.

Official references used for this qualification:

- [Airbnb: Reviews for homes](https://www.airbnb.co.uk/help/article/13)
- [Airbnb: Terms of Service for European users](https://www.airbnb.co.uk/help/article/2908)
- [ICO: What is personal data?](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/personal-information-what-is-it/what-is-personal-data/what-is-personal-data/)
- [ICO: Personal data obtained from publicly accessible sources](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/what-common-issues-might-come-up-in-practice/)

## Follow-on feature boundary

The next feature may extract review content to create approved landing-page
material. It must independently define permission and lawful-use assumptions,
handling or removal of names, exclusion of photographs and private host-only
feedback, editorial approval, traceability to local source material, withdrawal,
and the public data format. Nothing produced by this rename routine is
automatically safe to publish or necessarily anonymised.

## Implementation evidence

- `site/scripts/rename-airbnb-reviews.mjs` provides the OCR-backed command.
- `site/tests/reviews/rename-airbnb-reviews.test.mjs` covers the parsing and
  file-operation acceptance cases.
- A real dry run against the private source directory proposed the required
  Andrew filename, skipped 50 historical files, and reported no failures.
- A real apply run against a temporary copy of the Andrew PDF performed the
  canonical rename without altering the private source directory.
- `site/scripts/generate-public-airbnb-reviews.mjs` regenerates the public data
  deterministically from the ignored private PDFs. It stops at the first
  host-only rating overlay and retains complete public sentences rather than
  publishing flattened, corrupted, or private text.
- `site/src/data/public-reviews.json` contains 51 approved public review records,
  one for every PDF currently in the private directory, and no private
  source-traceability fields.
- `site/src/lib/public-reviews.ts` rejects malformed, duplicate, unapproved,
  HTML-bearing, unsupported, and additional-field records before rendering.
- `site/src/components/PublicReviewCarousel.astro` provides the landing-page
  panel above the footer, previous/next controls, compact page count, keyboard
  support, pointer swiping, sentence-boundary `More…` expansion, accessible
  rating text, and polite page announcements. All primary navigation surfaces
  link to `#guest-reviews`.
- The full booking-lifecycle suite passed with 73 tests, including the public
  review validation and homepage component contract.
- The production build and Astro check completed with no errors. One unrelated
  pre-existing unused-variable hint remains in the administration login page.
- The rebuilt local Docker service was inspected with direct Playwright at
  390x844, 768x1024, and 1440x900. Click, keyboard, sentence expansion, and
  pointer-swipe interactions selected or expanded the correct content and page
  counts. All sizes had zero horizontal overflow; the current application load
  had zero console warnings or errors and no failed network requests.
