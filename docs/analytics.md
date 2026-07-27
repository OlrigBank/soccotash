# Visitor analytics

The public Olrig Bank site supports optional Umami analytics. Tracking is disabled
unless `UMAMI_WEBSITE_ID` contains a valid Umami website UUID.

## Render configuration

Create a website for `olrig-bank.com` in Umami, then set its website ID in the
Render service:

```text
UMAMI_WEBSITE_ID=<website UUID>
UMAMI_SCRIPT_URL=https://cloud.umami.is/script.js
```

The script URL defaults to Umami Cloud and can be changed for a self-hosted Umami
installation. It must use HTTPS.

## Privacy boundary

Umami automatic tracking is disabled. Olrig Bank sends each pageview manually so
that private booking-management addresses are always recorded as
`/booking/manage`. The access token and the booking page query string are never
included. Event properties contain only a public property/listing identifier and
non-identifying workflow states.

The administration layout does not load analytics.

## Booking funnel events

- `listing_viewed`
- `availability_started`
- `availability_result`
- `booking_requested`
- `manage_booking_opened`
- `message_sent`
- `offer_accepted`
- `offer_declined`
- `payment_started`
- `booking_confirmed`

Use these events to build Umami funnels and journey reports. Do not add names,
email addresses, telephone numbers, booking references, access tokens, message
content, dates, or prices to event properties.
