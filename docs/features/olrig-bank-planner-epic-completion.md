# Olrig Bank Planner epic completion record

## Outcome

The epic is complete on the `development` branch. Its three stages were delivered through 22 independently reviewed increments: six administrator-planner increments, eight booking-linked collaboration increments and eight external-AI collaboration increments.

## Definition-of-done evidence

| Completion criterion | Delivered capability |
| --- | --- |
| Administrators create and publish reusable examples | Example-plan editing, ordering, duplication, revision history, publication and printable public views. |
| Eligible Bookers collaboratively maintain a booking-linked plan | Automatic planner creation, example copying, Booker editing, participant roles, invitations, concurrency handling and activity history. |
| Plans use Local Guide entries and custom activities | Stable Local Guide references coexist with plan-owned activities and notes. |
| Guest contributions follow consent and moderation | Explicit opt-in submission, withdrawal, administrator moderation and retained attribution evidence. |
| Authorised guests create restricted AI links and QR codes | Short-lived scoped capabilities, one-time link display, QR download, expiry display and revocation. |
| External AI returns proposals only | Versioned restricted representation and closed proposal schema; capability endpoints cannot mutate the live plan. |
| Guests approve changes before application | Diff review, conflict detection, full/partial/edited acceptance and rejection with atomic revisions and decision evidence. |
| Planner remains complete without AI | All administrator, Booker, participant, sharing and printing workflows operate independently of AI capabilities. |
| Work is documented and tested | Every increment has a linked brief. Lifecycle, PostgreSQL integration, type and production-build validation cover the completed aggregate. |

## Security and retention position

- Booking, payment, contact, participant, private-item, reservation and consent data are excluded from the AI representation.
- Invalid, expired, revoked and booking-inactive AI credentials disclose no plan data.
- AI reads and proposal attempts have separate, concurrency-safe request budgets.
- Access evidence contains no tokens, URLs or plan content and is retained for 90 days.
- Capability lifecycle revisions and proposal decisions remain the durable business audit trail.

## Ongoing operation

Future planner work should be raised as a new feature or maintenance item rather than extending this epic. Database migrations remain forward-only, and deployment validation must continue to run lifecycle tests, PostgreSQL integration tests, Astro checking and the production build.
