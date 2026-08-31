# Airbnb review capture and PDF workflow

This document records the working process used on 31 August 2026 to inspect an
already-open Chrome session, capture Airbnb host reviews as verified PDFs, and
reproduce the privacy-limited public review JSON from those PDFs. It is intended
as a practical hand-off for future Codex sessions.

## Outcome

The Chrome extension connection was used to claim the existing Airbnb tab at:

```text
https://www.airbnb.com/progress/reviews
```

The workflow was first proven with one review, then applied to all 52 reviews in
the list. Each public review, private host note when present, stay metadata, and
detailed category ratings was captured in a clean, single-page A4 PDF. The
final set was written beneath:

```text
output/pdf/airbnb-reviews/
```

The final directory contained exactly 52 PDFs with 52 distinct review IDs and
52 distinct extracted PDF texts.

Do not hard-code a review ID, browser tab ID, browser instance ID, or extension
instance ID. All of these are session-specific and must be discovered afresh.

## Tools and capabilities used

- The Codex Chrome-control skill and its bundled `browser-client.mjs` runtime.
- The Chrome extension browser binding selected with
  `agent.browsers.get("chrome")`.
- `chrome.user.openTabs()` to inspect user-owned tabs without navigating them.
- `chrome.user.claimTab(tabInfo)` to control the exact existing Airbnb tab.
- The tab Playwright API:
  - `domSnapshot()` to inspect the visible Airbnb interface;
  - `getByRole(...).click()` to expand and open reviews semantically;
  - `locator('[role="dialog"]').innerText()` to read the complete open review.
- The tab CDP capability and `Page.printToPDF` for Chrome-native PDF creation.
- A temporary local HTTP server for a dedicated print layout.
- Poppler tools:
  - `pdfinfo` to verify metadata, page count, size, and format;
  - `pdftoppm` to render the final PDF to PNG.
- Image inspection of the rendered PNG for layout quality assurance.

## Browser connection procedure

Read the Chrome-control skill before browser work. Initialise its runtime using
the absolute path to the skill's `scripts/browser-client.mjs`, select Chrome,
and read the complete browser documentation before using the browser API.

At the start of the browser task, name the session. Then list user tabs:

```js
await chrome.nameSession("Airbnb review PDF");
const openTabs = await chrome.user.openTabs();
```

Select the current tab entry by its exact Airbnb URL and claim that returned
object. Never guess or reuse a numeric tab ID from a previous session:

```js
const tabInfo = openTabs.find(
  (tab) => tab.url === "https://www.airbnb.com/progress/reviews",
);
const tab = await chrome.user.claimTab(tabInfo);
```

Use a DOM snapshot to confirm that the Reviews tab and review list are present.
The first visible review is represented as a button. Open it with a semantic
role-and-name locator based on the fresh snapshot, not screen coordinates.

After clicking, confirm that a dialog named `Single review page` is active and
read its complete text from `[role="dialog"]`. Airbnb can change its markup, so
reinspect the DOM if that selector stops matching.

## Complete-list capture procedure

### Expand and index the list

Airbnb initially rendered only part of the 52-review list. Click `Show more
reviews` repeatedly until that control is no longer present. In the successful
run this required four clicks.

Create a fresh index from the visible review buttons only after the full list
has loaded. Confirm that the number of indexed buttons equals the count shown by
Airbnb's `52 reviews` heading. Preserve each review's list position and button
index for the extraction pass.

Do not identify reviews from the guest name alone. Different reviews can have
the same guest name. The Airbnb `reviewId` from the opened review URL is the
canonical identity.

### Wait for populated review content

Airbnb can make `[role="dialog"]` visible before its content is populated. A
batch that accepted visibility alone produced empty captures and was rejected.

For each indexed review:

1. Ensure no previous review dialog is still visible.
2. Click the indexed review button.
3. Wait for `[role="dialog"]` to become visible.
4. Poll until both conditions are true:
   - the current URL contains `reviewId=`;
   - the dialog text has a meaningful non-empty length.
5. Capture the list text, dialog text, current URL, and page title together.
6. Close the dialog and confirm it is gone before opening the next review.

The close control occasionally needed a second semantic click after its
transition. Use a small bounded retry rather than assuming that the first click
succeeded. Never advance while the previous dialog is still visible.

### Parse and deduplicate

Parse the captured dialog into explicit fields:

- guest and review heading;
- Airbnb review ID;
- published date, stay dates, number of nights, and listing;
- public rating and public review;
- private note, when present;
- detailed rating categories, values, and feedback tags.

The six detailed-rating categories observed were:

- Check-in;
- Cleanliness;
- Accuracy;
- Communication;
- Location;
- Value.

Only include a category when it is present in the dialog. Preserve its numeric
rating and ordered feedback tags. Remove repeated tags within a category while
preserving the first occurrence. Exclude interface labels such as `Positive
feedback`, `Negative feedback`, `Write a public reply`, `Detailed ratings`, and
`Only visible to you and Airbnb` from captured review content.

Before rendering PDFs, require:

- the expected number of parsed reviews;
- one non-empty public review per item;
- one unique `reviewId` per item;
- unique normalised dialog and public-review text;
- no repeated rating category within a review;
- no repeated normalised feedback tag within a category;
- no interface-label contamination in public-review text.

For the 52-review run, all 52 reviews had all six detailed-rating categories
and 23 contained private notes.

## Chrome and Chromium troubleshooting

The browser API initially reported that Chrome was unavailable even though the
user could see a Chromium-family window. There were two separate issues:

1. A sandboxed `ps` command could not see host browser processes.
2. The Chrome extension browser binding was not connected at that moment.

When process detection is necessary, inspect the host process list with the
appropriate permission rather than trusting the sandboxed PID namespace. In
this case the host had both:

- a Linux Mint Chromium process under `/usr/lib/chromium/chromium`;
- a Google Chrome process under `/opt/google/chrome/chrome`.

Process presence alone does not make a browser controllable. The ChatGPT Chrome
extension and its native host must be installed, enabled, running, and connected.
Follow the Chrome-control skill's troubleshooting sequence, including its
browser list and extension/native-host checks. Once connected,
`agent.browsers.get("chrome")` and `chrome.user.openTabs()` should succeed.

## PDF creation procedure

Use the PDF skill for this task. Before the first authoring action, run its
required artifact-operation marker exactly once with the expected PDF count.
Use `1` for a single review or `52` for the complete list. The marker
script may be located inside the PDF skill directory rather than the repository
root; locate the bundled script if the repository-relative command fails.

### Why direct printing was rejected

Calling `Page.printToPDF` directly on the Airbnb page printed the fixed,
scrollable review dialog over the dimmed reviews page. It produced two pages,
and the second page contained a clipped, mostly empty continuation of the modal.
That result was rejected after PNG rendering and visual inspection.

Do not deliver a native print of the live modal unless rendering proves that
all dialog content is visible and paginated correctly.

### Working print approach

Create a temporary, self-contained HTML print layout using only the text read
from the open review dialog. Include:

- guest name and review heading;
- listing name and stay dates;
- public rating and public review;
- the private note, clearly labelled as visible only to the host and Airbnb;
- each detailed rating and its associated feedback tags.

Keep private material local. Do not upload, publish, or transmit the generated
HTML or PDF.

Serve the temporary directory over a local-only HTTP server, open that URL in a
new ephemeral Chrome tab, and use that tab's CDP capability:

```js
const cdp = await printTab.capabilities.get("cdp");
const result = await cdp.send("Page.printToPDF", {
  printBackground: true,
  preferCSSPageSize: true,
  displayHeaderFooter: false,
});
```

Decode `result.data` from base64 and save it under `output/pdf/` with a stable,
descriptive filename. For a batch, include the list sequence, guest slug, and
Airbnb review ID so that repeated guest names cannot overwrite one another:

```text
01-fred-1763706679522933548.pdf
```

Use A4 `@page` CSS, print-safe fonts, restrained colours, and avoid layouts that
split a rating row across pages. Render the number of star glyphs from the
actual numeric rating. Do not display five stars beside a rating of four.

### Prevent repeated PDF content

Every PDF print must explicitly navigate the print tab to that review's own
temporary HTML URL, wait for the page to load, and verify the resulting URL and
title before calling `Page.printToPDF`.

Do not optimise the first item by assuming that the print tab already displays
it. During a regeneration, that shortcut caused review 1 to print the final
review from the previous batch. The problem was detected because the unexpected
file size matched another PDF. The safe pattern is:

```js
for (const review of reviews) {
  const expectedUrl = `${printOrigin}/${review.htmlFile}`;
  await printTab.goto(expectedUrl);
  await printTab.playwright.waitForLoadState({ state: "load" });

  if (await printTab.url() !== expectedUrl) {
    throw new Error(`Print source mismatch for ${review.reviewId}`);
  }

  // Also confirm the title contains the expected guest before printing.
  const result = await cdp.send("Page.printToPDF", printOptions);
  // Save result.data to this review's unique output filename.
}
```

After printing, compare all extracted PDF texts or hashes. A 52-review run must
produce 52 unique results. Also verify that every PDF contains its expected
review ID, guest, public-review excerpt, and each captured rating heading.

Stop the temporary HTTP server and remove the temporary HTML after printing.
The ephemeral print tab does not need to be retained.

## Required verification

Run `pdfinfo` against every final file and confirm at least:

- the expected title;
- A4 page size;
- the expected page count;
- no encryption or embedded JavaScript.

Render every page with `pdftoppm`, inspect every resulting PNG, and reject any
PDF if it contains clipping, overlap, blank continuation pages, unreadable text,
or missing review sections. For a batch, contact sheets are useful for checking
all pages consistently, but inspect the longest and densest reviews separately
at full resolution. Do not allow a contact-sheet generator to include older
contact sheets recursively; restrict its input filenames to rendered review
pages.

After any layout or data correction, regenerate all affected PDFs and repeat
text extraction and visual inspection against the latest files. In the complete
run, visual review caught misleading five-star glyphs beside four-star numeric
ratings. The glyph-generation rule was corrected before the final render.

Remove temporary HTML, raw capture data, extracted text, render PNGs, and the
local HTTP server after final verification. Remove superseded PDFs that would
otherwise duplicate a review.

The successful batch output was 52 single-page A4 PDFs with no visible clipping,
overlap, blank continuation pages, or missing review sections.

## Reproducing the public review JSON

The 52 generated PDFs were subsequently used to reproduce:

```text
site/src/data/public-reviews.json
```

This is a separate publication-data operation. The generated PDFs remain private
source material, while the JSON must contain only the fields permitted by
`docs/features/capturing-airbnb-reviews.md`.

## Canonical private dataset and public projection

The repeatable workflow now produces two datasets directly from the clean review
PDFs. Run it from `site/`:

```text
npm run reviews:generate-datasets -- --approved-at YYYY-MM-DD
```

The command reads `output/pdf/airbnb-reviews/*.pdf` and writes:

```text
docs/source-material/airbnb/reviews/private-review-manifest.json
site/src/data/public-reviews.json
site/src/data/public-review-summary.json
```

The first output is the private source of truth. Its structure is defined by
`docs/source-material/airbnb/private-review-manifest.schema.json`, and generation
fails if the result does not validate. It retains the Airbnb review ID, PDF
filename, exact stay dates, private note, and the six detailed ratings with
their feedback tags. The manifest lives in an ignored directory and must never
be imported into the website or committed.

The second output is a derived public projection. It contains only the existing
approved website fields. Exact dates, review IDs, PDF filenames, private notes,
detailed rating values, and rating feedback are deliberately omitted. Existing
records retain their previous approval date; `--approved-at` applies to newly
discovered reviews.

The third output is an approved aggregate projection for the landing page. It
contains only the number of reviews and the average score for each of the six
detailed-rating categories. It contains no per-review category rating, feedback
tag, guest identity, stay date, review ID, private note, or PDF reference. The
landing page validates this file independently before rendering the scores.

Input PDFs are deduplicated by Airbnb review ID. Repeated identical captures
produce one canonical record. Conflicting captures with the same ID stop the
run for manual investigation. Repeated feedback tags inside a detailed-rating
category are removed case-insensitively while preserving first-seen order.

The command verifies real stay dates, checks the calculated duration against
the displayed number of nights, requires all six rating categories in their
expected order, and requires the public/private section boundaries. A malformed
or incomplete PDF stops generation instead of silently publishing partial data.

For a new review, the operational sequence is now:

1. Capture and verify its PDF using the procedure above.
2. Place it in `output/pdf/airbnb-reviews/` using the established unique name.
3. Run `npm run reviews:generate-datasets -- --approved-at YYYY-MM-DD`.
4. Run `npm run test:reviews` and `npm run build`.
5. Inspect the public JSON diff, then deploy the website.

Both the captured PDF directory and private manifest directory are ignored by
Git. Only the schema, extraction code, tests, documentation, and sanitised public
JSON belong in version control.

### Do not feed generated filenames directly to the public generator

The generated PDF filenames use sequence, guest slug, and Airbnb review ID for
capture safety. The existing public-data generator expects canonical filenames
containing the exact stay dates, duration, reviewer, and listing classification.

Prepare temporary canonical copies of the generated PDFs. Read their visible
header fields with positional PDF text extraction and derive:

- reviewer name;
- listing title and Main House/Cottage classification;
- check-in and checkout dates;
- displayed number of nights.

The visible header can take any of these forms:

```text
August 27 - 30 - 3 nights - Published August 30, 2026
July 31 - August 4, 2025 - 4 nights - Published August 4, 2025
December 29, 2025 - January 2, 2026 - 4 nights - Published January 2, 2026
```

Use the displayed year when it is present. For a generated PDF whose end year
is present but whose start year is omitted, a December-to-January range uses the
previous year for check-in. Validate real calendar dates and require the date
difference to equal the displayed duration before creating a canonical copy.

Use the canonical filename forms defined in
`docs/features/capturing-airbnb-reviews.md`. Write these copies to a temporary,
ignored directory and never overwrite the original private PDFs.

### Historical duration mismatch

Do not reuse historical filenames without validating them. The existing March
2025 Steven filename stated `3 nights`, while the visible stay was March 21-23,
which is 2 nights. The generated PDF correctly displayed 2 nights. The temporary
canonical source therefore used:

```text
2025-03-21-2025-03-23 - 2 nights - Steven Review - Airbnb.pdf
```

The reproduced public JSON now records that stay as 2 nights. Neither the old
filename nor a displayed duration may silently override a contradictory date
calculation.

### Clean-layout public text extraction

The earlier `extractPublicQuote` implementation was designed around Airbnb's
older exported layout. On the clean generated PDFs it would have included stay
metadata, the `Public review` label, rating glyphs, and `Note from...` text in
the quote.

`site/scripts/generate-public-airbnb-reviews.mjs` now detects an explicit line
beginning with `Public review`. For that layout it reads subsequent non-empty
lines only until the first private or non-public boundary:

- `Note from...`;
- `Only visible to you and Airbnb`;
- `Write a public reply`;
- `Detailed ratings`.

The output must never contain private notes, individual category ratings,
category feedback, Airbnb review IDs, full URLs, or exact stay dates. Keep the
older extraction path for historical source PDFs that do not expose the clean
`Public review` marker.

A regression test in
`site/tests/reviews/generate-public-airbnb-reviews.test.mjs` supplies a clean
layout containing public text followed by a private note and detailed ratings.
It requires extraction of only the two public sentences.

### Generate into a temporary output first

Run `site/scripts/generate-public-airbnb-reviews.mjs` against the temporary
canonical copies and write to a temporary JSON path before changing the tracked
dataset. Pass an explicit approval date so a regeneration does not rewrite every
record merely because the command ran on a different day.

Validate the temporary result before replacing the tracked JSON:

- it contains exactly 52 records;
- all 52 IDs are non-empty and unique;
- the array is ordered from the most recent stay to the earliest;
- every record passes `validatePublicReviewData`;
- the output contains no prohibited fields or private-boundary phrases;
- no record contains an Airbnb URL or review ID;
- the rating distribution matches the source evidence;
- the temporary JSON is byte-for-byte identical to a final generator run before
  considering the operation complete.

The successful regeneration produced:

- 52 approved public records;
- 50 five-star records;
- two four-star records;
- no prohibited privacy matches;
- Fred as the new most recent record;
- no missing IDs from the prior 51-record dataset.

The clean generated PDFs restored the complete public text for 29 reviews that
the older image/overlay extraction had truncated at complete sentence boundaries.
This is expected only when the complete text is proven to remain inside the
public-review block.

### Final checks and cleanup

After writing `site/src/data/public-reviews.json`:

1. Run `npm run test:reviews`.
2. Validate the final file through `validatePublicReviewData`.
3. Confirm record count, unique IDs, rating distribution, and prohibited-field
   scan again.
4. Compare the final file with the previously validated temporary output.
5. Run `git diff --check` and inspect the JSON diff.
6. Remove temporary canonical PDFs, temporary JSON, extraction helpers, and OCR
   intermediates.

The successful run passed both review test files and left no temporary private
review material under `tmp/`.

## Privacy and safety notes

- An Airbnb host review may contain a private note. Treat it as sensitive even
  when the public review itself is public.
- Writing the PDF locally does not authorise sharing it with another service or
  person.
- Do not reply to the guest, submit a form, or otherwise represent the host
  without separate, action-time confirmation.
- Do not inspect cookies, saved passwords, browser storage, or authentication
  tokens to recover access.
