# Proposed PR — Stage 3.7: Approval, partial approval and rejection

## Objective

Let the Booker or an active editor explicitly accept, edit and accept, selectively accept, or reject a pending AI proposal while preserving the Holiday Plan as the authoritative source of truth.

## Required guarantees

- Decision payloads are closed, bounded and server-validated.
- Edited replacement operations pass the same proposal schema as external submissions.
- Stale, private, booked or otherwise conflicting operations cannot be applied.
- Rejection records evidence without changing the plan revision.
- Accepted operations, proposal decision evidence and one plan revision commit atomically.
- A decided proposal cannot be decided again.
- Accepted history identifies the external AI proposal and the authorising guest.
