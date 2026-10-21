# Guided Airbnb workflows — handover

Branch: `feat/guided-airbnb-import`. Target: `development`.

## Delivered commands

- `npm run airbnb:import`: interactive, read-only database preflight.
- `npm run airbnb:import -- --apply`: permits imports after target and backup confirmation.
- `npm run airbnb:import -- --apply --allow-production`: additionally permits the production target.
- `npm run airbnb:analyse`: guided local ZIP-to-workbook analysis with optional dependency setup.

The import prompts explain credential sources, hide secrets and select the run and
reviews/bookings/both. Reports under `.airbnb-capture/import-reports/` contain
aggregate results and evidence hashes, not credentials or guest content.

Existing reviews are skipped, including changed recaptures; ordinary imports do
not alter their data, source association or website publication. Strictly newer
booking captures update non-empty fields, preserve missing values and replace
verified financial perspectives with their lines atomically. Zero is a value.
Earlier evidence is retained. Incomplete captures preserve existing conversations.
New messages are appended conservatively using sender, body and interpreted time;
ambiguous/edited/undated entries remain in evidence rather than being guessed.
Manual matching decisions remain unchanged. Unchanged reruns are idempotent.

The analysis launcher invokes the existing Python calculation engine unchanged.
It accepts paths with spaces, defaults to the export cutoff date and a fresh
output directory, refuses overwrites and offers pinned dependency installation.
No database credentials are needed. Both workflows retain their direct commands.

## Verification and boundaries

- Type checking: no errors or warnings; three existing hints outside this work.
- Production build passed.
- Seven guided-import checks passed, including real synthetic PDFs, disposable
  PostgreSQL updates, incomplete messages, preserved private values, financial
  replacement, old/equal-time captures, review/publication immutability, manual
  decisions, reruns, prompt rendering, cancellation and credential redaction.
- Three existing review/admin/reconciliation integration checks passed; the
  reservation import/parser regressions also passed during implementation.
- Twenty-seven capture/publication regressions passed, including responsive
  administration and public review browser tests.
- Twenty Python analysis tests passed with pinned dependencies in a temporary
  virtual environment, including the new launcher's prompts and cancellation.
- The actual saved booking that originally caused the October conflict was
  replayed in a disposable local schema: one booking updated, both source
  documents retained and all three earlier messages preserved. Schema removed.
- CLI prompts were inspected in an interactive terminal. No website components,
  routes or database migrations were added. No live database imports, deployments
  or publication decisions were performed as part of implementation.

CI runs the guided importer regression and includes the Python launcher in the
analysis workflow's path filters. Private ZIPs, generated workbooks, credentials,
local environments and unrelated working files are excluded from this PR.

## Continuing after merge

Use `docs/airbnb-terminal-capture.md` for capture/import and
`docs/features/standalone-reservation-analysis.md` for workbook generation.
No new migration is required. Use the merged revision locally, run development
preflight, then explicitly apply. Existing October captures can be reused.
Production imports remain a separate operator action after development acceptance.
An import can commit an earlier stage before a later stage fails; inspect its
private report before retrying. Original evidence must not be overwritten.
