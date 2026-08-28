# Proposed PR — Stage 3.3: AI collaboration page and explicit instructions

## Objective

Expose the restricted v1 plan safely through a purpose-built, provider-neutral collaboration page that tells an external AI exactly how it may assist.

## Scope

- Add capability-protected human, plan JSON and JSON Schema views.
- Resolve all three views through the temporary AI capability rather than booking or participant credentials.
- Present explicit allowed, required and prohibited AI behaviours.
- Show a sanitized human itinerary generated from the same authoritative plan.
- Disable analytics and apply no-store, no-referrer and noindex protections.
- Record capability use without logging or displaying raw credentials in application data.
- State clearly that proposal submission is not enabled until the proposal-schema increment.

## Acceptance criteria

- Invalid, expired and revoked credentials receive the same non-disclosing 404.
- The JSON output is the Stage 3.1 `olrig-holiday-plan` version `1.0` representation.
- The schema URL is protected by the same capability as the plan.
- The page has no planner mutation controls and cannot alter the live plan.
- No ordinary site analytics execute on the capability page.
- Responses are non-cacheable, non-indexable and use a no-referrer policy.

## Out of scope

- QR codes and authenticated capability-management UI.
- Proposal submission, validation, diffing or approval.
- Provider-specific integrations or stored AI conversations.
