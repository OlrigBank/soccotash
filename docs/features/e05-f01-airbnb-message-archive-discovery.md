# E05-F01 — Airbnb Message Archive Discovery

## Status

Complete for the 1 September 2026 archive and scroll-exhausted active-inbox
collections.

## Parent epic

[`E05 — Capturing All Details from Airbnb Messages`](epics/e05-f00-capturing-all-details-from-airbnb-messages.md)

## Purpose

Create a complete, private and repeatable inventory of the signed-in Airbnb
active inbox and message archive before any collection-wide PDF generation. The inventory must
identify stable conversation IDs, distinguish booking records from other
threads and make the eventual capture count auditable.

## Proven baseline

Conversation `1982219304` was captured as the first end-to-end booking proof.
The verified PDF contains the complete displayed conversation, reservation
details and both Earnings tabs. The reusable HTML renderer rejects missing
messages, reservation details or financial tabs.

## Scope

- Load both the active inbox and archive lists to their true ends rather than
  accepting the initially rendered viewport.
- Capture each visible entry's list label and stable conversation identity.
- Classify entries as confirmed/completed booking, subsequently cancelled
  booking, unconfirmed request/inquiry, Airbnb Support or other.
- Record the evidence and reason used for every classification.
- Reconcile duplicate guest names and repeated list labels by conversation ID.
- Deduplicate conversations that appear in both collections while retaining
  their active/archive provenance.
- Save the inventory privately and keep message bodies out of normal operator
  output.

## Implementation notes

- Airbnb virtualises the archive list; inventory must use bounded scrolling and
  stop only when repeated end-state checks find no new identities.
- List links currently expose `href="#"`, so stable conversation IDs must be
  captured after selecting each entry and verifying the resulting message URL.
- The conversation panel and reservation-details panel are semantically hidden
  while the Earnings dialog is open. Those states must never be queried in the
  same pass.
- A reservation panel is strong booking evidence. Status events such as
  request accepted, reservation confirmed or cancellation must also be retained
  for classification and audit.

## Deliverables

1. A private combined inbox/archive inventory keyed by Airbnb conversation ID.
2. A reconciliation summary containing counts by classification without
   reproducing private message content.
3. Fixtures and tests for classification and duplicate detection.
4. A documented capture queue for qualifying bookings.

## Acceptance criteria

1. Repeated discovery without archive changes returns the same unique ID set.
2. Every rendered archive entry has either a conversation ID or an explicit
   discovery error.
3. No conversation ID occurs more than once in the canonical inventory.
4. Support threads and non-booking conversations are excluded with reasons.
5. Confirmed and subsequently cancelled bookings remain distinguishable.
6. Guest names are never used as canonical identity.
7. The private inventory and capture queue are ignored by Git.
8. Operator output reports only counts, statuses and non-sensitive identifiers.

## Validation

- Run classification and reconciliation tests.
- Confirm the private inventory is ignored by Git.
- Compare two consecutive inventory passes for identical ID sets.
- Run `git diff --check` on tracked changes.

## Progress — 1 September 2026

- Confirmed that the archive currently renders 38 entries and an explicit end
  of inbox marker.
- Added deterministic classification and reconciliation code with coverage for
  support threads, booking candidates, cancelled booking candidates,
  unconfirmed cancelled requests, duplicate IDs and missing index ranges.
- Confirmed that a monolithic 38-entry browser pass is unsuitable: Airbnb keeps
  each conversation-selection transition open long enough to exceed the
  browser execution window.
- Rejected all timed-out partial passes; no incomplete inventory is accepted.
- The live discovery implementation will persist small bounded batches, verify
  each batch immediately and merge only when indexes 0 through 37 resolve to 38
  unique conversation IDs.
- Completed the bounded inventory pass in an isolated signed-in Chrome tab:
  38 archived entries and 15 active-inbox entries resolved successfully.
- Reconciliation produced 53 unique conversation IDs with no cross-collection
  duplicates in the current source state.
- Preliminary list-label classification found 43 ordinary booking candidates,
  three cancelled-booking candidates, six support threads and one cancelled
  unconfirmed request. Conversation `1982219304` was already verified, so the
  provisional queue contained 45 further entries.
- The first queued capture was rejected rather than saved because Airbnb
  exposed visible but initially empty panels, followed by a conversation-actions
  overlay that made the work tab unresponsive. The batch capture must enforce
  non-empty conversation/reservation polling and distinguish the conversation
  actions overlay from the separate Earnings dialog before accepting a record.
- Completed the active and archived inbox batch: 44 valid booking conversations
  produced 44 private PDFs covering 181 A4 pages and 606 displayed message
  events. Every PDF contains reservation details, the headline total, both the
  `You earn` and `Guest paid` views, and the complete displayed conversation.
- Excluded two date-bearing list entries after inspecting their conversation
  source: `1981469185` was a request cancelled before confirmation and
  `2629718262` was an inquiry for unavailable dates. Neither displayed an
  Earnings breakdown, so neither is a booking record.
- Re-rendered the full batch after normalising duplicate accessible heading
  text, then verified all 44 PDFs structurally, by extracted text, and through
  visual contact-sheet inspection of all 181 pages.

## Final inventory reconciliation

| Classification | Count | Capture treatment |
| --- | ---: | --- |
| Ordinary booking candidate | 41 | Captured |
| Cancelled-booking candidate | 3 | Captured |
| Airbnb Support | 6 | Excluded |
| Unconfirmed request | 2 | Excluded |
| Booking inquiry | 1 | Excluded |
| **Unique conversations** | **53** | **44 captured / 9 excluded** |

The private capture queue now contains the 43 records processed after the
initial proof. The two false-positive date-bearing entries were removed, while
their final classifications and exclusion reasons remain in the private
canonical inventory.

## Capture and PDF implementation notes

- Direct navigation to the stable conversation URL was more reliable than
  repeatedly selecting virtualised list rows during the detailed capture pass.
- A record is accepted only after the conversation groups, reservation panel
  and headline-total button are all populated.
- Message events are collected from accessible message groups in displayed
  order. The renderer parses sender, body, date and time while preserving
  service events alongside guest and host messages.
- The Earnings dialog is opened only after page-state capture. The host panel is
  captured first; the guest tab is selected semantically and its selected state
  is verified before reading it.
- Raw captures use schema version 1 and are rejected by the renderer if any
  required booking identity, reservation, message or financial section is
  absent.
- Stable PDF filenames contain a sequence and conversation ID. Guest names are
  descriptive only and are never used as the unique key.

## Verification performed

1. Generated HTML for all 43 post-proof captures without validation failures.
2. Confirmed 44 output PDFs and 44 unique conversation IDs.
3. Used PDF metadata inspection to confirm 181 A4 pages and the absence of
   encryption or embedded JavaScript.
4. Extracted final PDF text and confirmed every conversation ID, every required
   section and all 606 captured message events using Unicode-normalised probes.
5. Rendered all 181 pages to images, assembled 12 contact sheets and visually
   inspected every page.
6. Regenerated and repeated verification after fixing duplicated accessible
   guest headings.
7. Ran both classifier and renderer test files successfully, confirmed private
   paths are ignored, and passed `git diff --check`.

## Operational cautions

- Work only in a separate ephemeral tab; do not navigate or close the user's
  original signed-in Airbnb tab.
- Do not log message bodies, access instructions, phone numbers, confirmation
  codes or financial values in normal operator output.
- Treat missing Earnings as a classification signal requiring source review,
  not as an empty successful booking capture.
- Reinspect the live DOM when Airbnb changes labels or roles. The observed
  selectors and accessible-label grammar are implementation evidence, not a
  supported Airbnb API.
- Stop the temporary local print server and remove rendered PNG/contact-sheet
  working files after final verification. Retain only the ignored raw evidence,
  inventory and final PDFs.

## Resumable non-archived rerun — 1 September 2026

A separate fresh pass was completed for the non-archived inbox after the
combined archive/active run. The work was deliberately divided into durable
stages so it can resume without restarting the browser collection:

1. Discovery was saved in three five-entry files after resolving every
   date-bearing list row to its stable conversation ID.
2. Classification was saved separately: 15 unique conversations, 14 bookings
   and one excluded inquiry (`2629718262`).
3. The 14 same-day canonical raw captures were individually revalidated for
   matching conversation ID, non-empty reservation data, messages, and both
   Earnings tabs. Their message counts and SHA-256 fingerprints were saved in
   three capture checkpoint files.
4. Fourteen validated, self-contained HTML print sources were written to the
   run directory with a separate HTML manifest.
5. PDFs were generated into
   `output/pdf/airbnb-message-bookings-active-2026-09-01/` in batches of five,
   five and four; each completed batch has its own filename/size checkpoint.
6. Final verification was saved separately and records 14 unique PDFs, 64 A4
   pages and 232 displayed message/service events. Text and visual inspection
   both passed.

The ignored run directory is
`docs/source-material/airbnb/messages/non-archived-2026-09-01/`. Its
`run-state.json` records completion independently for discovery,
classification, capture validation, HTML, PDF and verification. A restarted
session can inspect that state plus the per-batch files and continue only the
first incomplete stage. The rerun left the original combined PDF collection
unchanged.

### Correction and continuation

The 15-entry result above is a completed checkpoint for the initially rendered
active-inbox segment, not proof that the complete non-archived collection was
exhausted. Airbnb displayed an `End of Inbox data` accessibility group while
still allowing more conversation rows to be appended after scrolling the
conversation-list container. Therefore:

- an accessibility end marker is not, by itself, a terminal condition;
- discovery must scroll the list container in bounded increments;
- each increment must merge stable conversation IDs into a disk checkpoint;
- completion requires repeated bottom-scroll passes with no new IDs and a
  stable rendered-entry count;
- previously captured IDs remain valid restart points, while newly appended IDs
  enter separate classification and capture batches.

The active-only collection is being continued from the 15 saved IDs rather
than discarded or restarted. Its final counts and verification totals will be
recorded after the scroll-to-exhaustion pass completes.

### Scroll-to-exhaustion result

The continuation pass reached a stable total of 86 unique non-archived
conversation IDs after three bottom checks. The list expanded in observed
steps of 15, 30, 60 and 86 entries. Entries 15 through 85 were resolved and
saved in five-item discovery checkpoints (with a final six-item batch).

Of the 71 newly revealed conversations:

- 45 are qualifying bookings with a populated reservation, an Earnings
  control, and separate **You earn** and **Guest paid** tab panels;
- 26 are inquiries, requests, pre-approvals, potential-earnings-only records or
  Airbnb Support and were excluded with per-entry reasons;
- 478 newly captured message/service events were written to private raw JSON;
- no capture-stage errors remain.

Airbnb also lazily appends the lower reservation controls only after the
right-hand details panel is scrolled. In some cases that DOM update becomes
observable only on the following browser operation. The reliable process is
therefore three-phase: navigate and populate, scroll/prime the details panel,
then inspect and capture Earnings in a subsequent operation. The accessible
name of the reliable headline-total control is `Earnings`; matching its visible
`Total for ...` text alone produced false negatives.

All 45 new validated captures and HTML print sources were saved before PDF
generation. After a Linux-session suspension, PDF work resumed directly from
that checkpoint without repeating discovery, classification, conversation
capture or HTML generation. The continuation PDFs were written in nine
five-file batches, each with its own completion manifest.

Final active-only verification covers 59 unique booking PDFs (the original 14
plus 45 continuation files), 244 A4 pages and 710 displayed messages or Airbnb
service events. All files are unencrypted, contain the reservation details,
**You earn**, **Guest paid** and complete-conversation sections, and passed
Unicode-normalised source-to-PDF text checks. All 244 rendered pages were
inspected across 16 contact sheets; no clipping, overlap, blank continuation
page or missing section was found.

The complete non-archived reconciliation is therefore 86 unique conversations:
59 qualifying bookings captured and 27 non-booking/support conversations
excluded with recorded reasons. The final private verification record is
`non-archived-2026-09-01/pdf-verification.json`.
