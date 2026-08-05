# Proposed PR — Stage 3.4: QR code and link-management interface

## Objective

Let the Booker and active editors deliberately create, copy, scan, download and revoke temporary AI collaboration links from their authenticated planner workspaces.

## Scope

- Add AI capability management to Booker and editor planner views.
- Show the exact categories shared and excluded before capability creation.
- Offer one, four, twelve and 24-hour lifetimes.
- Return the raw link once and generate its QR code locally inside Olrig Bank.
- Provide copy-link and download-QR controls alongside visible expiry and revocation state.
- Reuse the existing revision, same-origin, role and stale-write protections.

## Acceptance criteria

- Contributors and viewers cannot see or invoke AI capability management.
- QR generation sends no capability URL to an external service.
- The QR encodes the same temporary URL shown in the copy field.
- Reloading shows capability metadata but never reveals the raw credential or QR again.
- Revocation immediately invalidates the collaboration link.
- All controls have text labels and remain keyboard operable.

## Out of scope

- Proposal submission and validation.
- Proposal diffing, review or approval.
- Request-rate hardening.
