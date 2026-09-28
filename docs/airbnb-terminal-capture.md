# Airbnb capture from a terminal

The repository provides standalone Playwright scripts for capturing a supplied
list of review or booking-conversation URLs. They run on your computer without
Codex, the Chrome extension or OlrigBankWeb administration pages. Chrome DevTools
Protocol `Page.printToPDF` generates clean PDFs from the extracted records.

This is a supervised capture tool, not an Airbnb API integration. The first
version uses explicit URLs: it does not automatically discover the complete
active inbox, archive or review list. It never sends messages, writes to
PostgreSQL, or approves material for public publication.

## Install and sign in

From the repository root, use Node 24 or newer and install the existing project
dependencies:

```bash
npm ci
npm --prefix site ci
```

Install Google Chrome and Poppler (`pdftotext`, `pdfinfo`, and `pdftoppm`). On
Ubuntu/Debian the Poppler package is `poppler-utils`; on macOS it is `poppler`.
The default browser channel is installed Google Chrome. Alternatively install
Playwright's Chromium with `npx playwright install chromium`, then add
`--channel chromium` to each command.

```bash
npm run airbnb:browser
```

This opens a **separate browser profile** under `.airbnb-capture/chrome-profile/`.
Sign into Airbnb manually, complete any authentication challenge, and select
English and GBP in the Airbnb interface. Check that you can view your host
reviews and messages. Press Enter in the terminal to save and close that browser
before running capture commands. Existing everyday Chrome profiles are not
copied or modified. Repeat this command if the session expires.

The scripts preserve Airbnb's English date labels because the existing import
parsers expect them. Script instructions and operator messages use British
English. Locale, markup, or rating-label changes can cause a capture to stop;
they must not be interpreted as an empty successful result.

## Capture reviews

Open each required review in Airbnb and copy its URL, including `reviewId`.
Save one URL per line in `.airbnb-capture/reviews.txt`. Blank lines and lines
beginning with `#` are ignored. For example, substituting real review IDs:

```text
https://www.airbnb.com/progress/reviews?reviewId=123456789
```

```bash
npm run airbnb:capture -- reviews --run september-2026 --urls .airbnb-capture/reviews.txt
```

For one review, use `--url` instead of `--urls`. The script reads the displayed
review dialog, including private notes and all six detailed-rating categories.
It rejects missing categories, inconsistent stay dates and unclear private-text
boundaries. It prints a separate review document, not Airbnb's scrollable modal.

Stay detection uses the date range and night count, independently of the word
`Published`. Both the older `August 27 – 30 - 3 nights` and current
`27–30 August·3 nights` formats are supported. Publication dates can be on a
separate line, including a date beneath a standalone `Published` label.

Airbnb can omit the stay year and publication date altogether. Publication is
optional: unavailable dates remain JSON/SQL `null`, render as **Published
unknown** in PDFs, and display as **Unknown** in administration lists. A missing
publication date is never replaced by checkout or capture time. For an already captured review,
the runner looks up the same Airbnb review ID in
`docs/source-material/airbnb/reviews/private-review-manifest.json` and uses its
verified dates. Displayed dates and duration must agree with that record; only
date metadata is reused, not the previous review text or ratings.

You can supply additional verified metadata using
`--review-metadata .airbnb-capture/review-metadata.json`. The file has this shape
(replace the example identity and dates with verified values):

```json
{
  "reviews": [{
    "source": { "reviewId": "123456789" },
    "stay": { "checkIn": "2026-08-27", "checkOut": "2026-08-30", "nights": 3 },
    "publishedAt": "2026-08-30"
  }]
}
```

`publishedAt` may be `null` in this file. An explicit metadata file replaces the
default manifest lookup for that run.

Stay years are resolved independently of publication dates, in this order:

1. An explicitly displayed year (including the other end of the same stay).
2. Matching existing review metadata, retaining any earlier assumption label.
3. Matching reservation evidence supplied using
   `--reservation-metadata .airbnb-capture/reservations.json`.
4. If no year is found, the **current year at capture time in Europe/London**,
   recorded as `current-year-assumption`. For December–January stays this is
   the arrival year and departure is in the following year.

The optional reservation file has this shape:

```json
{
  "reservations": [{
    "propertyId": "main-house",
    "bookerDisplayName": "Example Guest",
    "arrival": "2025-08-27",
    "departure": "2025-08-30",
    "nights": 3
  }]
}
```

Use known reservation records to populate this private file. Matching requires
property, guest identity, arrival/departure day and month, and duration to agree.
Conflicting matching years stop capture for review; a guest name alone is
insufficient. The capture tool does not query PostgreSQL automatically. Without
an evidence file it uses the other sources above. The resulting year source is
preserved in the private JSON, PDF and PostgreSQL `stay_year_source` column;
assumed years are also identified on the administration detail page.

## Capture booking conversations

Save booking conversation URLs in `.airbnb-capture/bookings.txt`:

```text
https://www.airbnb.com/hosting/messages/123456789
https://www.airbnb.com/hosting/messages/987654321?archived=
```

```bash
npm run airbnb:capture -- bookings --run september-2026 --urls .airbnb-capture/bookings.txt
```

The script requires a populated reservation panel and an **Earnings** button.
It loads earlier conversation history, captures overlapping message windows in
displayed order, checks repeated stable endpoints, and collects **You earn** and
**Guest paid**, including expandable financial rows. Selected financial tabs are
checked before reading them. Support threads, enquiries and unconfirmed requests
without both financial views are not accepted as bookings.

`--urls` also accepts a JSON array of URL strings or the existing private queue
format `{ "items": [{ "url": "...", "captureEligible": true }] }`. Entries
explicitly marked `captureEligible: false` are excluded; repeated Airbnb IDs are
captured once. Existing discovery queues can therefore be reused:

```bash
npm run airbnb:capture -- bookings --run archive-recapture --urls docs/source-material/airbnb/messages/inventory/capture-queue.json
```

A supplied queue is the capture scope. Successful completion does not prove that
every booking in the Airbnb inbox or archive was supplied.

## Outputs, verification and resuming

Raw JSON, private diagnostics and completion manifests go into:

```text
.airbnb-capture/runs/september-2026/reviews/
.airbnb-capture/runs/september-2026/bookings/
```

Verified PDFs go into:

```text
output/pdf/airbnb-terminal/september-2026/reviews/
output/pdf/airbnb-terminal/september-2026/bookings/
```

Both roots are ignored by Git. Directories use owner-only permissions and files
use mode `0600`. The profile contains the signed-in browser session; protect it
like a credential. Private JSON and PDFs contain guest data and may contain
access instructions. Terminal progress prints aggregate counts, not guest data.

Every PDF passes `pdfinfo`, `pdftotext`, and the same parsers used by the existing
database importers before being marked complete. Reviews are compared with their
captured structured record. Booking PDFs must retain their identity, every
captured message, and arithmetically verified financial totals. Incomplete or
unparseable PDFs never appear as completed output.

Rerun the exact command to resume. Completed items are hash-checked and verified,
then skipped. Captured raw JSON is reused when PDF generation was interrupted.
Changed or missing completed evidence is reported rather than overwritten.
Use a **new run name** when deliberately capturing newer Airbnb content.

To generate remaining PDFs without visiting Airbnb:

```bash
npm run airbnb:capture -- render --kind reviews --run september-2026
npm run airbnb:capture -- render --kind bookings --run september-2026
```

Offline rendering uses a fresh headless browser and does not load the signed-in
profile. A run stops on the first failed item and exits non-zero. Its private
`ID.error.txt` explains the failure; do not copy that file into public issues.
Review captures also save `ID.dialog.json` **before parsing**, with the exact
parser input (`dialogText`), the browser's rendered text (`renderedText`), source
identity and capture time. This private diagnostic file survives parsing
failures; it is not treated as a successful capture by resume or render.
Section-validation errors list each missing heading or stay line,
or an incorrect public-review/detailed-ratings order. Rerun the original capture
command to obtain these diagnostics for an older failure; the previous error
file alone cannot recover the original text. A retry replaces that item's
diagnostic snapshot with the latest extracted text.
If a process is killed, the run may retain `run.lock`. Confirm the recorded PID
is no longer running before removing that specific lock and resuming. Do not
run two capture processes against the same browser profile at once.

After capture, visually inspect PDFs, particularly unusually long reviews and
conversations. For a local rendering check:

```bash
pdftoppm -scale-to 1600 -png output/pdf/airbnb-terminal/september-2026/reviews/123456789.pdf .airbnb-capture/review-check
```

## Adapting to Airbnb interface changes

The selectors are isolated in `site/scripts/airbnb-capture/browser.mjs`. The
defaults target an accessible review dialog, complementary reservation panel,
conversation heading, and labelled message groups. If the current Airbnb page
uses different elements, inspect it and supply a private JSON selector file:

```json
{
  "reviewDialog": "[role=\"dialog\"]",
  "reservation": "[role=\"complementary\"]",
  "conversationHeading": "h1",
  "messageGroups": "[role=\"group\"][aria-label*=\". Sent \"]",
  "messageScroller": null
}
```

Pass it with `--selectors .airbnb-capture/selectors.json`. Each panel/heading
selector must match exactly one relevant visible element. `messageScroller`
can identify the conversation's scroll container explicitly; otherwise it is
inferred from the first displayed message group. Changes to text grammar or
financial structure require parser changes and fixture verification as well.

## Optional: attach to an existing debugging-enabled Chrome

The normal private-profile commands require no debugging-port setup. For an
already running dedicated Chrome session exposing a local CDP endpoint, add:

```bash
--cdp http://127.0.0.1:9222
```

Only loopback HTTP endpoints are accepted. The runner opens and closes its own
tabs and disconnects afterwards; it does not navigate or close existing user
tabs. An ordinary Chrome session or Codex extension connection is not itself a
CDP endpoint. Keep any debugging endpoint local and use a dedicated profile.

## PostgreSQL remains a separate operation

These commands capture and verify evidence only. The existing review importer
accepts `--directory`; the booking importer accepts positional directories.
Use the documented, separately authorised database procedure after reviewing
new captures. See [private import operations](airbnb-private-import-operations.md)
and [deployment boundaries](features/epics/completed/e08-f00-deploy-airbnb-dataset-to-render-deployments.md).

Apply migration `066_airbnb_optional_review_publication.sql` to the intended
database before importing these records or deploying the updated admin queries.
It makes `published_on` nullable and adds year provenance without changing
existing dates. Publication sorting places unknown dates last in either
direction; publication-date filters exclude unknown dates.

Important existing limitations:

- Importers preserve canonical evidence and reject conflicting historical
  content. A recaptured booking containing later messages is not automatically
  merged into an existing reservation.
- The existing full-dataset verifier targets the reviewed 155-document baseline.
  It cannot certify a new capture run without its baseline being deliberately
  updated.
- Capturing a review does not authorise publishing it. Public JSON generation
  remains a separate reviewed operation.

## Development verification

```bash
npm run test:airbnb-capture
npm run test:reviews
npm run test:airbnb-date-integration
npm run build
npm run test:airbnb-review-dates
```

The capture suite uses disposable browser fixtures and real Chromium/CDP PDF
generation, followed by production parser verification. It performs no real
Airbnb requests. The initial implementation still requires an authenticated
live smoke check against Airbnb's current markup before an unattended batch;
use one review and one booking first.

### Implementation hand-off — 28 September 2026

- Twelve automated checks cover input restrictions, queues, review privacy
  boundaries, overlapping messages, browser capture/PDF parsing, offline CLI
  resumption and tampered evidence, login/missing-earnings failures, explicit
  section diagnostics, saving review text before failed parsing, independent
  stay/publication parsing, calendar validation and reservation-year evidence.
- Existing review tests also pass. Disposable source pages were exercised at
  1440 × 1000. The nullable-date follow-up also tests the rebuilt admin views at
  390 × 844, 768 × 1024 and 1440 × 900 using synthetic records.
- Installed Chrome generated a one-page review and a three-page booking PDF.
  All four A4 pages were rendered with Poppler and visually inspected: no
  clipping, overlap or missing rating glyphs was found.
- **Private Review Sheet** is the new custom HTML-to-PDF layout. **Private
  Booking Record** reuses the existing custom booking PDF layout. **Unknown
  Review Date** is a custom text status within the existing administration
  table/cards and detail heading, with an explanation for assumed stay years.
- No real Airbnb session, customer account, production database connection or
  public review publication was used for verification. PostgreSQL checks use
  disposable local schemas. Live Airbnb selectors remain
  unverified in this implementation session.
- The updated date parser has additionally been checked against the saved
  private Airbnb dialog containing the current day-first stay format without
  a publication label. It parses using the matching historical date metadata;
  this check did not revisit Airbnb or alter stored captures.
- The newer saved review without historical metadata now parses with a null
  publication date and a recorded current-year assumption. Its synthetic PDF
  equivalent has been checked with Poppler and visually inspected.
- PostgreSQL import/idempotency, null persistence, date sorting/filtering,
  administrator queries and reconciliation tests pass. Browser checks exposed
  and corrected an existing local-midnight/UTC conversion that shifted summer
  dates by one day, plus a table heading escaping its tablet scroll container.
- Chrome DevTools verified the rebuilt list/detail pages at 390 × 844,
  768 × 1024 and 1440 × 900, including keyboard skip navigation, visible focus,
  labelled structure, unknown-date/assumed-year text, empty results and return
  links. The tablet table retains intentional local scrolling without document
  overflow. The inspected page and stylesheet returned 200 with no console
  errors. Playwright permanently covers the responsive list/detail/filter flow.
- Lighthouse's detail-page snapshot initially found a 4.4:1 contrast ratio on
  the date explanation. The scoped correction was rebuilt and audited again:
  accessibility 100, best practices 100 and agentic browsing 100. SEO remained
  80 for the existing missing meta description on this private, noindex admin
  page; no public search metadata was changed.
- Migration 066 was exercised only in disposable local schemas. No production
  migration or deployment was performed. The existing 155-document verifier
  baseline has not been expanded to include new captures.
