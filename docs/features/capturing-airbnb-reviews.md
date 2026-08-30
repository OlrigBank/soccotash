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
  leave the file unchanged.

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

## Follow-on feature boundary

The next feature may extract review content to create anonymised landing-page
material. It must independently define consent or lawful-use assumptions,
removal of names and photographs, exclusion of private host-only feedback,
editorial approval, traceability to local source material, and the public data
format. Nothing produced by this rename routine is automatically safe to publish.

## Implementation evidence

- `site/scripts/rename-airbnb-reviews.mjs` provides the OCR-backed command.
- `site/tests/reviews/rename-airbnb-reviews.test.mjs` covers the parsing and
  file-operation acceptance cases.
- A real dry run against the private source directory proposed the required
  Andrew filename, skipped 50 historical files, and reported no failures.
- A real apply run against a temporary copy of the Andrew PDF performed the
  canonical rename without altering the private source directory.
