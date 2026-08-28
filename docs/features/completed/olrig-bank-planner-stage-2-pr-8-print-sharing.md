# Proposed PR — Stage 2.8: Printable and shareable views

## Objective

Give the travelling group a clean itinerary to print and let the Booker deliberately create a revocable, read-only sharing link.

## Scope

- Add print-focused itinerary views for the Booker and invited participants.
- Let the Booker create and revoke time-limited read-only share links.
- Store only a SHA-256 share credential hash and show the raw link once.
- Bind each share credential to one booking-linked plan and the booking access lifetime.
- Show day/item itinerary content while omitting reservation notes, private items, participants, activity history and contribution data from shared views.
- Keep private and shared planner views non-indexed, non-cacheable and protected by a no-referrer policy.
- Record share creation and revocation in plan history.

## Acceptance criteria

- Print controls are keyboard operable and print CSS removes navigation and controls.
- A share URL grants read-only access to one sanitized itinerary and no mutation endpoint.
- Raw share credentials are never stored or logged.
- Revoked, expired and invalid links return the same non-disclosing 404.
- Share access cannot outlive the underlying booking access policy.
- Creating or revoking a share does not expose booking, payment or contact information.

## Out of scope

- Public search indexing.
- Editing through a share link.
- Per-item share selection beyond private item visibility.
- QR codes and external AI collaboration links.
