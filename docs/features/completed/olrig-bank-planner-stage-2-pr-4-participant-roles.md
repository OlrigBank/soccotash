# Proposed PR — Stage 2.4: Participant roles and permissions

## Objective

Let the Booker safely invite other guests into the booking-linked Holiday Planner with an explicit, server-enforced role.

## Scope

- Let the Booker create, inspect, change and revoke participant invitations.
- Issue high-entropy invitation links while storing only a SHA-256 token hash.
- Resolve invited participants independently of the Booker's private booking credential.
- Support editor, contributor and viewer roles; the Booker remains the sole owner.
- Allow editors to maintain plan content, contributors to propose activities, and viewers to read only.
- Re-check participant role and revocation state for every mutation.
- Attribute participant changes to their stable participant identity.
- Keep participant workspaces private, non-indexed and non-cacheable.

## Acceptance criteria

- Raw invitation credentials are returned only when created and never persisted or logged.
- Revoked or invalid links disclose no plan information.
- Viewers cannot mutate; contributors cannot alter established plan structure or decisions.
- Editors can use the existing day and item editing workflow.
- A credential cannot be used against another plan by substituting identifiers.
- Owner, role and invitation changes create revision history.

## Out of scope

- Email delivery of invitation links.
- Comments and proposal approval UI.
- Recent activity presentation.
- Guest Local Guide contribution consent.
