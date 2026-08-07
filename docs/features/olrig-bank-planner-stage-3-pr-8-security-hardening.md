# Proposed PR — Stage 3.8: Expiry, rate limiting and audit hardening

## Objective

Complete the external-AI security boundary with concurrency-safe request budgets and token-free operational evidence while preserving the existing expiry and revocation guarantees.

## Required guarantees

- Invalid, expired, revoked and booking-inactive credentials disclose no plan data.
- Read traffic is limited to 120 requests per 15 minutes per capability.
- Proposal submission is limited to 10 attempts per hour per capability.
- Rate decisions are serialised in PostgreSQL so concurrent requests cannot bypass them.
- Rate-limited callers receive HTTP 429 and `Retry-After` guidance.
- Granted, expired, booking-inactive and rate-limited attempts are recorded without tokens, URLs or plan content.
- Capability creation/revocation revisions and proposal decisions remain the durable business audit trail.
- Access-event evidence is operational data intended for a 90-day retention window; capability and proposal records follow their Holiday Plan.
