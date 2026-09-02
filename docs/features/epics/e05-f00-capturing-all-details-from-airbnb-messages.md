# E05 — Capturing All Details from Airbnb Messages

## Status

Complete for the inbox state captured on 1 September 2026.

The implementation and documentation are merged into `development`. Private
source captures and generated PDFs are intentionally excluded from Git.

## Epic summary

Build a private, repeatable capture workflow for booking-related entries in the
signed-in Airbnb active inbox and message archive. For every qualifying booking, the workflow
will preserve the complete displayed conversation, reservation details, host
earnings breakdown and guest-paid breakdown in a verified local PDF.

The completed implementation was developed on
`agent/capture-airbnb-message-bookings` and merged into `development`.

This epic follows the capture and verification principles recorded in
[`airbnb-review-chrome-pdf-workflow.md`](../../airbnb-review-chrome-pdf-workflow.md),
but message threads require multi-page rendering, booking classification and
financial reconciliation that are not part of the review workflow.

## Desired outcome

A guided local workflow should:

1. load and index the complete Airbnb active inbox and message archive;
2. distinguish booking-related conversations from support and non-booking
   conversations;
3. capture every displayed message and Airbnb service event in each qualifying
   conversation;
4. capture all displayed reservation details, including the headline host
   total;
5. open the Earnings dialog and capture both the **You earn** and **Guest paid**
   tabs, including expandable itemised rows;
6. render one clean, readable PDF for each booking;
7. verify identity, completeness, totals, pagination and uniqueness; and
8. retain a private manifest so interrupted or repeated runs are resumable and
   idempotent.

## Delivered outcome — 1 September 2026

- Indexed 38 archived entries and 15 active-inbox entries, producing 53 unique
  conversation IDs with no duplicates between the two collections.
- Classified the final inventory as 41 ordinary booking candidates, three
  cancelled-booking candidates, six Airbnb Support threads, two unconfirmed
  requests and one booking inquiry.
- Captured all 44 qualifying bookings: the original proof plus 43 remaining
  active/archive records.
- Generated exactly 44 private PDFs containing 181 A4 pages and 606 displayed
  conversation messages or service events.
- Included the displayed reservation panel and headline total, plus both the
  **You earn** and **Guest paid** Earnings views, in every booking PDF.
- Excluded conversation `1981469185` after its source showed a request cancelled
  before confirmation, and conversation `2629718262` after its source showed an
  inquiry for unavailable dates. Neither exposed an Earnings breakdown.
- Verified every output structurally with `pdfinfo`, by extracted text, and by
  visual inspection of contact sheets containing all 181 rendered pages.
- Confirmed that all raw capture data, inventory files and generated PDFs are
  covered by repository ignore rules.
- Continued the non-archived discovery to a scroll-exhausted total of 86 unique
  conversations after three stable bottom checks, correcting the initial
  15-entry checkpoint that had relied on Airbnb's premature end marker.
- Classified the complete non-archived collection as 59 qualifying bookings
  and 27 non-booking or support conversations.
- Generated and verified 59 active-inbox booking PDFs containing 244 A4 pages
  and 710 displayed messages or Airbnb service events.

## Implementation delivered

- `site/scripts/classify-airbnb-message-archive.mjs` provides deterministic
  classification, reconciliation, duplicate detection and missing-index
  checks for inventory fixtures.
- `site/scripts/generate-airbnb-message-booking-html.mjs` validates captured
  booking data and renders a private, self-contained A4 HTML record. It refuses
  captures without a conversation ID, reservation details, messages, or either
  Earnings tab.
- `site/tests/reviews/classify-airbnb-message-archive.test.mjs` covers support,
  booking, cancelled-booking and unconfirmed-request classification plus
  reconciliation failures.
- `site/tests/reviews/generate-airbnb-message-booking-html.test.mjs` covers
  message parsing, required financial states, escaping and duplicate accessible
  headings.
- Private canonical inventory, queue and raw captures are stored beneath
  `docs/source-material/airbnb/messages/`; final PDFs are stored beneath
  `output/pdf/airbnb-message-bookings/`.

## Proven operating workflow

1. Discover the archive and active inbox separately in an isolated tab using
   bounded list batches; persist and verify each batch before proceeding.
2. Merge by Airbnb conversation ID, retaining collection provenance and list
   index, then classify each unique record.
3. Navigate directly to each conversation URL and poll until message groups,
   reservation text and the headline-total control contain meaningful data.
4. Capture conversation and reservation state before opening Earnings, because
   the dialog semantically hides the page behind it.
5. Open Earnings from the headline-total control, capture **You earn**, switch
   to **Guest paid**, verify that the requested tab reports selected state, and
   capture it before closing the dialog.
6. Render validated capture JSON into local HTML, navigate a dedicated print tab
   to that record, verify its identity, and print through Chrome to PDF.
7. Require the expected unique ID/file counts; use PDF metadata, text
   extraction and page rendering to reject incomplete or visually broken files.

## Issues encountered and resolutions

- Airbnb virtualises inbox lists and list anchors expose `href="#"`. The
  workflow therefore discovers stable conversation IDs only after selecting an
  entry and verifying the resulting URL.
- The active inbox can expose an `End of Inbox data` accessibility marker before
  all historical rows have been appended. A terminal result therefore requires
  scrolling the list container to its bottom repeatedly and observing a stable
  entry/ID count across multiple passes; the marker alone is insufficient.
- A single 38-entry archive operation exceeded browser execution limits.
  Discovery was changed to small bounded batches that are immediately saved and
  reconciled.
- Panels can be visible before their text is populated. Visibility alone is not
  accepted; capture polls for non-empty message, reservation and total content.
- An early attempt opened the conversation-actions overlay instead of Earnings
  and left the work tab unresponsive. The final process targets the headline
  total, verifies the Earnings dialog and treats overlays as distinct states.
- Earnings hides the background conversation from semantic selectors. Page and
  dialog data must be collected in separate passes.
- Switching financial tabs by text alone was insufficient. The final capture
  verifies `aria-selected` before reading **Guest paid**.
- Two list labels looked like bookings because they displayed dates and a
  listing. Source inspection and the absence of Earnings proved they were an
  unconfirmed request and an inquiry, demonstrating that list-label
  classification is only provisional.
- Airbnb exposed duplicate consecutive guest headings through accessibility
  text, producing headings such as `Wendy Wendy`. The renderer now collapses
  consecutive duplicate heading lines; the whole batch was regenerated and
  visually rechecked.
- Message accessible labels vary: dates may omit the year, use weekday or
  relative names, place `Most Recent Message` in different positions, and add
  trailing status text. The parser accepts these observed variants while still
  failing unknown formats.
- Emoji and PDF text extraction do not always normalise identically. Final
  completeness checks normalise Unicode, remove presentation/joiner characters
  for comparison, and use meaningful message-body probes without weakening the
  required section and conversation-ID checks.

## Proposed feature sequence

### E05-F01 — Archive discovery and booking classification

[Feature record](../completed/e05-f01-airbnb-message-archive-discovery.md)

- Expand or scroll the active inbox and archive until all available entries are indexed.
- Record list position, conversation URL/ID, guest label, listing, stay dates
  and visible booking status.
- Identify conversations by Airbnb conversation ID, never guest name alone.
- Classify confirmed, completed and subsequently cancelled bookings separately
  from inquiries, unconfirmed requests and Airbnb Support conversations.
- Record whether each entry was discovered in the active inbox, archive or both.
- Deduplicate the combined inventory by conversation ID.
- Produce a private reconciliation report before capture begins.

### E05-F02 — Complete conversation and reservation capture

- Open each indexed booking through semantic browser controls.
- Wait for the conversation identity, message history and reservation panel to
  populate before reading them.
- Capture message date, time, sender, body, reactions and Airbnb service events
  in displayed order.
- Capture every displayed reservation field, including guest information,
  listing, stay dates, check-in/out, number of nights, status, policy, booking
  date, confirmation code and headline total when present.
- Detect lazy-loaded or truncated message histories and fail rather than
  silently accepting partial content.

### E05-F03 — Host and guest financial capture

- Open the booking's Earnings dialog and verify its booking context.
- Capture the selected **You earn** tab and expand all available itemised rows.
- Capture nightly charges, adjustments, taxes/fees and the host total exactly as
  displayed.
- Switch to **Guest paid**, verify the selected-tab state and capture its full
  breakdown and total.
- Preserve currency labels and negative adjustments.
- Reconcile the reservation headline total with the host total and validate
  arithmetic where the displayed rows provide enough information.

### E05-F04 — Private PDF generation

- Render structured, self-contained HTML from the captured local data rather
  than printing Airbnb's live multi-panel interface.
- Produce one PDF per booking with clear sections for booking identity,
  reservation details, conversation, host earnings and guest-paid summary.
- Use stable filenames containing a sequence and Airbnb conversation ID so
  repeated guest names cannot overwrite one another.
- Use A4 print styling and page-break rules that keep message headers, message
  bodies and financial rows together where practical.
- Keep all temporary HTML and generated PDFs local and private.

### E05-F05 — Verification, manifest and recovery

- Require the expected number of unique booking IDs and PDF files.
- Confirm each PDF contains its expected conversation ID, booking identity,
  headline total, host total and guest total.
- Compare extracted text or hashes to detect repeated or stale print output.
- Use `pdfinfo`, text extraction and rendered page inspection for every PDF.
- Reject clipping, overlaps, blank continuation pages, missing messages,
  missing tab content or inconsistent totals.
- Store a private manifest with source identity, capture status, source
  fingerprint, totals, PDF filename and verification timestamps.
- Resume after interruption without duplicating already verified evidence.

### E05-F06 — Operational documentation and tests

- Document browser discovery, capture, recovery and cleanup.
- Add fixtures for long threads, duplicate guest names, cancelled bookings,
  missing Earnings dialogs, expandable adjustments and both financial tabs.
- Test parsing, classification, pagination inputs, reconciliation and privacy
  boundaries without requiring a live Airbnb session.
- Provide a dry-run or inventory mode before any batch PDF generation.

## Data and privacy requirements

- Message PDFs, raw captures, manifests and reconciliation reports are private
  source material and must be ignored by Git.
- Captures may contain guest identities, phone numbers, access instructions,
  key-box codes, confirmation codes and financial data.
- Private capture content must not be uploaded, published, logged to shared
  services or imported by the public website.
- Operator summaries should report identifiers and status without reproducing
  message bodies or access credentials.
- No workflow step may reply to a guest, modify a booking or otherwise act as
  the host.

## Reliability requirements

- Discover browser, tab and conversation identifiers afresh for every session.
- Do not assume archive list order remains stable after opening a conversation.
- Require the selected Earnings tab to match the section being captured.
- Expand all financial detail controls before treating a breakdown as complete.
- Explicitly navigate the print tab to each booking's own source before PDF
  generation and verify its URL and title.
- Make capture idempotent by Airbnb conversation ID and stop on conflicting
  evidence for an existing ID.
- Treat missing reservation or Earnings information as an explicit capture
  state, not an empty successful result.

## Acceptance criteria

1. A complete archive inventory contains unique conversation IDs.
2. Support and non-booking conversations are excluded with a recorded reason.
3. Qualifying bookings retain every displayed message and reservation field.
4. Both **You earn** and **Guest paid** states are captured and labelled.
5. Expandable financial rows are included when Airbnb exposes them.
6. The headline host total agrees with the captured host-total section or the
   discrepancy is reported for manual review.
7. Every qualifying booking produces exactly one uniquely identified PDF.
8. Long conversations paginate without clipped, duplicated or reordered
   messages.
9. Extracted PDF text contains the expected booking identity and all required
   totals.
10. Re-running unchanged evidence does not create duplicate PDFs or records.
11. An interrupted batch can resume from the last verified booking.
12. No private capture artifact is tracked by Git or consumed by the website.

## Initial proof

The archived David conversation at Airbnb conversation ID `1982219304` confirms
that the current interface exposes the required states. Its reservation panel
contains a headline host total, and its Earnings dialog provides separate
**You earn** and **Guest paid** tabs with itemised summaries. This booking will
be used as the first end-to-end PDF proof before archive-wide capture.

The proof was completed on 1 September 2026. The private four-page A4 PDF
contains all 17 displayed conversation events, reservation details, the
headline host total and both financial summaries. Text extraction confirmed all
17 message bodies and required totals. Visual inspection confirmed no clipping,
overlap or blank continuation pages. The proof also established that the
Earnings modal hides the background conversation from semantic browser
selectors, so conversation/reservation and financial states must be captured in
separate passes.

## Final verification record

- PDF count: 44.
- Unique booking conversation IDs: 44.
- Page count: 181 A4 pages.
- Displayed messages and Airbnb service events checked: 606.
- Required sections per PDF: reservation details, **You earn**, **Guest paid**
  and complete conversation.
- Automated tests: two files passed with no failures.
- Repository whitespace validation: `git diff --check` passed.
- Visual result: no clipped content, overlaps, duplicate visible headings,
  blank continuation pages or missing sections were found across the final
  181-page render.

## Scroll-exhausted non-archived verification record

The active inbox required repeated scrolling of its conversation-list
container; its initial `End of Inbox data` marker appeared before all rows had
loaded. Requiring a stable row count across repeated bottom passes expanded the
inventory from 15 to 86 unique conversations.

- Qualifying booking PDFs: 59.
- Excluded inquiry, request, pre-approval, potential-earnings-only and Support
  conversations: 27.
- Page count: 244 A4 pages.
- Displayed messages and Airbnb service events checked: 710.
- Required sections per PDF: reservation details, **You earn**, **Guest paid**
  and complete conversation.
- Resume behavior: discovery, capture, HTML generation and nine five-PDF
  continuation batches have independent private disk checkpoints.
- Structural and source-text verification: passed for all 59 PDFs.
- Visual inspection: all 244 pages checked across 16 contact sheets with no
  clipping, overlap, blank continuation pages or missing sections.

## Out of scope until separately authorised

- Publishing or sharing captured message or financial data.
- Replying to guests or changing reservations.
- Circumventing Airbnb authentication or access controls.
- Treating Airbnb page markup as a supported or stable API.
- Capturing unrelated Airbnb Support threads.
- Automatically deleting historical evidence when a conversation disappears
  from the current archive.
