# Booking WhatsApp notifications

PR #43 adds opt-in transactional WhatsApp notifications through the Meta WhatsApp Business Platform (Cloud API). The private booking page remains the authoritative record. Email is used as the fallback when WhatsApp is unavailable or a submitted message later receives a terminal failure status.

## Consent

- The booking-form checkbox is optional and unticked by default.
- Consent is recorded with its version, source, timestamp and the normalized E.164 number to which it applies.
- A Booker or administrator can withdraw consent immediately. It is never inferred from the presence of a telephone number.
- Changing the telephone number does not transfer existing consent to the new number.

## Required Meta setup

1. Use an Olrig Bank Meta Business portfolio and WhatsApp Business Account. This integration does not automate the consumer WhatsApp or WhatsApp Business apps.
2. Register and verify the sending number, create a system user token with the minimum required WhatsApp permissions, and approve the versioned transactional template.
3. Configure the development service variables listed in `site/.env.example`. Secrets must be entered in Render, never in source control. Keep `WHATSAPP_DELIVERY_ENABLED=false` while configuring and testing the webhook.
4. Register `https://<development-host>/api/webhooks/whatsapp/` as the webhook URL and use the configured verification token.
5. Subscribe to message status updates. The endpoint requires Meta's `X-Hub-Signature-256` signature for POST requests.

For a controlled rollout, set `WHATSAPP_RECIPIENT_ALLOWLIST_REQUIRED=true`
and put only explicitly authorised E.164 numbers in the comma-separated
`WHATSAPP_RECIPIENT_ALLOWLIST`. Treat the allowlist as a secret because it
contains personal data. The guard is checked both before notification delivery
is claimed and again immediately before the Meta request.

## Delivery semantics

The application records a notification event independently of each delivery attempt. WhatsApp states progress through `queued`, `submitted`, `sent`, `delivered`, `read`, or `failed`; provider callbacks are idempotent and cannot regress a later state. A provider acceptance is recorded as `submitted`, not as delivery.

The callback accepts a maximum 1 MiB request, verifies Meta's HMAC against the
exact bytes received and processes statuses sequentially in provider timestamp
order. When `WHATSAPP_INBOUND_AUTO_REPLY_ENABLED=true`, an inbound message from
a normalized telephone number present in the booking table receives the
standard redirection acknowledgement at most once in 24 hours. Unknown senders
receive no response. The application retains no inbound body or media metadata,
and this does not provide a two-way conversation service.

Failed inbound acknowledgements create no email fallback. They appear in
Administration Alerts and can be retried, up to the bounded attempt limit, with:

```bash
npm run process:inbound-whatsapp-replies
```

A terminal failure creates one durable job in
`booking_notification_fallback_jobs`. It does not send email inside Meta's
webhook request. Run the bounded processor from the deployed service with:

```bash
npm run process:notification-fallbacks
```

The processor calls `/api/admin/process-notification-fallbacks/` using
`BOOKING_SERVICE_URL` and the existing `CALENDAR_SYNC_TOKEN`. In Render, invoke
the command at least once per minute using the development environment's
existing scheduler or a Cron Job. Render cron expressions use UTC. Do not add a
new paid Cron Job without approval; the endpoint can be invoked manually for a
controlled development acceptance test.

Recipient telephone numbers are masked in delivery history and stored as hashes for correlation. Webhook bodies, access tokens, private booking URLs and rejection/cancellation reasons are not copied into the notification ledger.

## Safe rollout

1. Run the unit and integration test suites against a disposable development database.
2. Deploy the feature branch only to the Render development service and apply
   migrations `017_whatsapp_notifications.sql` and
   `053_whatsapp_fallback_queue.sql` and
   `054_whatsapp_inbound_acknowledgements.sql`.
3. Use Meta's test recipient and synthetic bookings first. Enable the independent delivery switch only for the controlled test window. Confirm submission, sent/delivered/read updates, duplicate/out-of-order callback handling, and email fallback on terminal failure. Trigger `npm run process:notification-fallbacks` after the controlled failure and confirm that the queued job completes once.
4. A real booking may be used only after the Booker has explicitly consented and the user has explicitly authorized the send. Do not include the real phone number, booking token, screenshots containing either, or provider credentials in issues, commits, logs, or the pull request.
5. Production activation is outside PR #43 and requires a separate explicit decision after acceptance testing.
