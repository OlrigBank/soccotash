# Proposed PR — Stage 3.2: Capability-token model and security controls

## Objective

Create the temporary, revocable security boundary that later AI collaboration pages and proposal endpoints will use without granting access to the ordinary planner or booking credential.

## Scope

- Add a dedicated AI capability table bound to one booking-linked Holiday Plan.
- Generate 256-bit opaque credentials and persist only their SHA-256 hashes.
- Fix capabilities to protocol version `1.0` and the narrow `plan:read` and `proposal:submit` scopes.
- Permit expiry from one to 24 hours and never outlive the underlying booking-access policy.
- Allow only the Booker or an active editor to create or revoke capabilities.
- Clear the credential hash on revocation and retain creation, use and revocation evidence.
- Record creation and revocation as atomic Holiday Plan revisions.

## Acceptance criteria

- Invalid, expired, revoked and booking-expired credentials all resolve identically to no access.
- A capability cannot address a different plan or gain broader scopes.
- Contributors and viewers cannot delegate access to an external AI.
- Raw credentials are returned once, never stored, and have at least 256 bits of entropy.
- Concurrent or stale management actions use the existing plan-revision protections.

## Out of scope

- Public collaboration routes and AI instructions.
- QR codes and guest link-management UI.
- Proposal payloads, validation, review or approval.
- Request-rate enforcement, which is completed in the final hardening increment.
