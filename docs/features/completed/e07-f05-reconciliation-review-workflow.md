# E07-F05 — Reconciliation Review Workflow

## Status

Complete.

## Parent epic

[`E07 — Airbnb Administration Dashboard`](../epics/e07-f00-airbnb-admin-dashboard.md)

## Objective

Provide a careful administrator workflow for resolving proposed review-to-
reservation candidates using the immutable, audited E06 decision service.

## Scope

- Add `/admin/airbnb/reconciliation/` showing proposed candidates first.
- Present review and reservation stay/listing evidence side by side, identity
  compatibility and candidate-count reasons without showing unrelated private
  conversation or financial content.
- Link to the full review and reservation details in separate views.
- Add a same-origin authenticated POST endpoint accepting link UUID, decision
  and explicit confirmation input.
- Resolve the UUID to the internal link ID server-side and call the existing
  transactional decision function with `Astro.locals.adminUser.id`.
- Require deliberate confirmation for both confirm and reject actions.
- Handle already-decided and competing-manual-confirmation conflicts with a
  non-destructive `409` response and useful UI feedback.
- Show decision status, reviewer identity and audit timestamp after completion.

## Tests

- Six-current-proposal baseline and a synthetic no-work state.
- Confirmation supersedes an automatic link and audits both changes.
- Rejection preserves the existing confirmed link.
- Repeated submission and concurrent decision conflict.
- Invalid UUID/decision/confirmation, anonymous `401` and non-POST `405`.
- Reconciliation rerun preserves the manual decision.

## Acceptance criteria

1. Administrators can resolve proposals without database or command-line access.
2. Every successful action identifies the administrator and produces audit
   evidence.
3. No manual decision is silently overwritten.
4. Failed or repeated actions leave link state unchanged.
5. The UI never implies that matching names alone are sufficient evidence.

## Delivered implementation

- Added stable UUIDs for reconciliation links without exposing internal sequence
  identifiers.
- Replaced the placeholder with a bounded proposed-candidate workspace showing
  review/reservation stay and listing evidence side by side, compatibility and
  ambiguity counts, plus links to both full records.
- Added deliberate confirm/reject controls with a browser confirmation step and
  an explicit confirmation value in the request.
- Added an authenticated, same-origin, JSON-only POST endpoint that resolves the
  UUID server-side and supplies the signed-in administrator ID to the E06
  transactional decision service.
- Added non-destructive `409` handling for replayed/already-decided candidates
  and competing manual confirmations, and `405` handling for other methods.
- Manual confirmation explicitly rejects and audits a superseded automatic
  confirmation; manual rejection leaves the existing confirmation in place.

## Validation

- The read-only live Agent2 check returns all six proposals with link, review
  and reservation UUIDs and complete non-content evidence. None has compatible
  identity evidence, so none is presented as a safe automatic match.
- Synthetic PostgreSQL coverage verifies confirmation supersession, rejection,
  audit events, immutable decisions, rerun preservation and one confirmed link.
- Runtime endpoint tests cover anonymous, cross-site, wrong-content-type,
  missing-confirmation, invalid-input and non-POST requests.
- No decision was applied to the six real proposals during verification.
