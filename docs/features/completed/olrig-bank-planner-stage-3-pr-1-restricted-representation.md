# Proposed PR — Stage 3.1: Versioned restricted plan representation

## Objective

Define the provider-neutral, machine-readable plan contract that future temporary AI collaboration capabilities may expose without revealing the booking record.

## Scope

- Add the `olrig-holiday-plan` version `1.0` representation and JSON Schema.
- Serialize one dated booking-linked plan with stable opaque plan, day and item identifiers.
- Preserve explicit day/item order, current revision, stay dates, item types and statuses.
- Include non-sensitive planning notes, locations and stable Local Guide references.
- Exclude private items and all reservation notes by construction.
- Keep booking identifiers, access credentials, contact/payment data, participants, activity history and contribution/moderation data outside the contract.
- Reject example or undated plans at the serializer boundary.

## Acceptance criteria

- The representation is deterministic for the same authoritative plan revision.
- The schema closes every object with `additionalProperties: false` and documents bounds and enumerations.
- Stable UUIDs are retained so later proposals can address existing days and items safely.
- An item remains an idea, proposal, agreement or booking exactly as recorded; serialization never promotes status.
- Contract tests prove sensitive fields and private items cannot enter the output.

## Out of scope

- Capability tokens, routes or public access.
- AI instructions and QR codes.
- Proposal submission, validation or approval.
