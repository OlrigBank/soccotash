# E02 — Getting WhatsApp Telephone Messaging Working

## Status

Active; development-only implementation and acceptance.

## Goal

Make Olrig Bank's consent-based transactional WhatsApp notifications reliable,
observable and safe to validate in the `soccotash` development environment
before any production activation is considered.

The private booking page remains the authoritative record. WhatsApp provides
timely booking updates, with email as the fallback when delivery fails.

## Existing foundation

The application already provides:

- explicit consent bound to the Booker's current E.164 telephone number;
- approved-template delivery through the Meta WhatsApp Cloud API;
- an independent `WHATSAPP_DELIVERY_ENABLED` kill switch;
- an authenticated Meta callback for outbound delivery statuses;
- idempotent notification and delivery ledgers; and
- email fallback when WhatsApp is unavailable.

The callback currently concerns delivery evidence for messages sent by Olrig
Bank. Receiving and replying to guest-authored messages is a separate product,
privacy and operational decision.

## Configuration contract

The application consumes these Render environment variables:

- `WHATSAPP_PROVIDER=meta`
- `WHATSAPP_DELIVERY_ENABLED`
- `WHATSAPP_INBOUND_AUTO_REPLY_ENABLED`
- `WHATSAPP_GRAPH_API_VERSION`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_APP_SECRET`
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- `WHATSAPP_TEMPLATE_BOOKING_UPDATE`
- `WHATSAPP_TEMPLATE_LANGUAGE`
- optional per-event `WHATSAPP_TEMPLATE_<EVENT>` overrides
- `BOOKING_PUBLIC_URL`

The Meta WhatsApp Business Account ID is useful for Meta administration but is
not currently consumed by the application at runtime. Secret values belong in
the Render Dashboard and must never be committed, logged or included in test
evidence.

## Feature sequence

1. [E02-F01 — Harden WhatsApp Delivery-status Webhooks](../e02-f01.md) —
   completed with controlled development acceptance.
2. [E02-F02 — WhatsApp Production Readiness](../e02-f02.md) — operational
   controls, fallback scheduling and an explicit activation decision.
3. [E02-F03 — Redirect Inbound WhatsApp Replies](../e02-f03.md) — acknowledge
   recognised booking contacts without retaining or exposing their message.
4. Optional conversational guest messaging, only if separately specified and
   approved.

## Epic acceptance criteria

1. Development callback verification and signed status delivery work through
   Meta.
2. Duplicate and out-of-order callbacks cannot regress delivery evidence.
3. Failure fallback is durable, prompt and operationally observable.
4. Tests cover consent, configuration, templates, signatures, route handling,
   persistence, idempotency and ordering.
5. Development delivery is restricted to an authorised test recipient and can
   be disabled independently.
6. No production activation occurs without a separate explicit decision.

## Out of scope

- Consumer WhatsApp or WhatsApp Business app automation.
- A shared inbox or two-way guest conversation history.
- Guest media ingestion, conversational automated replies or moderation.
- Storing or displaying guest-authored WhatsApp content.
- Production enablement as an incidental consequence of development testing.
