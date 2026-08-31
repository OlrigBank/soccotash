# E03 — Extending the Capture of New Reviews to Enrich the Private Review Manifest

## Status

Proposed.

## Epic summary

Turn the proven 52-review baseline into a safe incremental process for future
Airbnb reviews. The operator should be able to discover what is new, capture it
once, enrich the private manifest and deliberately publish approved projections
without repeating the complete historical browser exercise.

This epic follows the completed
[`capturing-airbnb-reviews.md`](../capturing-airbnb-reviews.md) baseline. It does
not replace Airbnb as the source of truth or assume a stable supported Airbnb
API.

## Remaining problem

A new review still requires coordinated manual work: noticing it, capturing and
verifying its PDF, regenerating datasets, reviewing privacy and publication
changes, rebuilding the site and deploying it. There is no persisted discovery
state, incremental queue, reconciliation report, recovery flow or deployment
handoff.

## Desired outcome

A repeatable operator command or guided workflow should:

1. compare Airbnb's current review IDs with the private manifest;
2. identify new, changed, missing and already captured reviews;
3. capture only required new or changed reviews;
4. verify each PDF and parsed record before merge;
5. preserve existing history and provenance;
6. regenerate private analysis and explicitly approved public projections;
7. report changes without printing sensitive review content; and
8. prepare a reviewable deployment change when publication is authorised.

## Proposed feature sequence

### E03-F01 — Discovery and reconciliation

- Read current review count and IDs from the signed-in host page.
- Compare them with the private manifest and PDF collection.
- Classify records as new, unchanged, changed, missing locally or no longer
  visible on Airbnb.
- Persist a private reconciliation report with status and timestamps.
- Identify reviews by review ID, never guest name alone.
- Keep review bodies and private notes out of operator output.

### E03-F02 — Incremental verified capture

- Reuse populated-dialog waits and semantic browser controls.
- Capture only new or explicitly selected changed records.
- Use unique review-ID-based HTML and PDF filenames.
- Verify URL, title and identity before every print.
- Reject empty, repeated, clipped or incomplete captures.
- Resume after interruption without duplicating verified work.
- Discover browser, tab and review identifiers at runtime.

### E03-F03 — Canonical merge and enrichment

- Validate new records before merge.
- Make merging idempotent by Airbnb review ID.
- Ignore identical repeated evidence but stop on conflicting evidence.
- Preserve provenance and record evidence refreshes.
- Add reconciliation status, last-seen date and source fingerprint only through
  an explicit schema-version migration.
- Recalculate aggregates only from accepted records.

### E03-F04 — Analysis outputs

- Produce private category summaries by property and time period.
- Display sample sizes with every average.
- Define minimum samples for publishing narrower aggregates.
- Detect material trends without presenting rounding noise as change.
- Keep private notes and guest-level scores out of public analysis.

### E03-F05 — Approval and deployment handoff

- Show a reviewable private-to-public projection diff.
- Require explicit approval for each new written review.
- Preserve existing approval dates and record new approvals.
- Verify aggregate output cannot disclose an individual's rating.
- Run privacy scans, review tests and the production build as one release check.
- Decide separately whether publication continues to require a site rebuild or
  moves to an independently served approved dataset.
- Never deploy merely because private evidence was captured.

## Data and privacy requirements

- PDFs, reconciliation reports and the canonical manifest remain ignored.
- The website never imports the private manifest.
- Logs exclude review bodies, private notes, photographs, profiles and URLs.
- Schema fields distinguish source evidence, private analysis and publication.
- Missing source reviews enter reconciliation rather than silent deletion.
- Retention, backup and secure deletion rules are documented before the dataset
  becomes a continuing operational record.

## Reliability requirements

- Discovery and capture are idempotent and resumable.
- Browser markup changes fail visibly rather than yielding partial data.
- Date and duration disagreements stop the affected record.
- Duplicate IDs and duplicate normalised content are detected.
- Each rating category and feedback tag is parsed once.
- Public projections are reproducible from approved private inputs.
- Tool and schema versions needed to explain output are recorded.

## Acceptance criteria

1. Mixed existing/new fixtures report only new IDs for capture.
2. A rerun without source changes reports no new work.
3. Interrupted capture resumes without reprinting verified PDFs.
4. Identical repeated IDs produce one canonical record.
5. Conflicting evidence stops merge with an actionable private error.
6. Removed source reviews enter reconciliation rather than silent removal.
7. A new accepted review updates all six private category aggregates.
8. No written review becomes public without explicit approval.
9. Public aggregates obey documented minimum sample sizes.
10. Privacy scans find no prohibited fields in public artifacts.
11. Review tests and the production build pass after a merge.
12. Documentation covers discovery, capture, recovery, approval,
    reconciliation and deployment handoff.

## Out of scope until separately authorised

- Circumventing Airbnb authentication or access controls.
- Scraping without the owner's active authenticated session.
- Replying to guests or otherwise acting as the host.
- Publishing private notes, guest-level detailed ratings or feedback.
- Automatically approving reviews.
- Automatically deploying solely because Airbnb changed.
- Treating Airbnb page markup as a guaranteed API.

## Validation baseline

Each feature should include, in proportion to its scope:

- fixtures for new, duplicate, changed and missing reviews;
- schema migration and compatibility tests;
- privacy scans of public artifacts;
- `npm run test:reviews`;
- public-review landing-page contract tests;
- `npm run build`;
- `git diff --check`; and
- browser verification when capture controls or presentation change.
