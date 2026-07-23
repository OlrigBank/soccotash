# Customer booking-page access

Every booking request now receives one stable private page shaped like:

```text
https://soccotash.onrender.com/booking/manage/<random-token>/
```

The customer is redirected to this page immediately after selecting **Request booking**. The page is the continuing record for the whole booking process: the initial request, the administrator's offer, the customer's response, and the confirmed booking.

The token is the credential. It is generated from 32 random bytes, is not derived from the booking UUID or contact details, and must be treated like a private password. The customer page sends `no-store`, `noindex` and `no-referrer` headers to reduce caching, search indexing and accidental link disclosure.

## Initial request stage

Before an offer exists, the page displays:

- property, dates and party size;
- the guest's supplied contact details;
- the request reference and submission time;
- the recorded provisional price calculation, when available;
- the message supplied with the request;
- an explanation of what happens next.

The customer is told to bookmark the page or copy its address somewhere safe. Email is optional and is not required to create or continue a booking.

Pending requests continue to block the associated availability calendar while Olrig Bank reviews them.

## Offer stage

Publishing an offer makes it appear immediately on the same customer page. Publishing no longer depends on successful email delivery. The administrator can optionally email a copy of the offer when the customer supplied an email address and an email provider is configured.

While an offer is active, the page displays:

- the offered price lines and total;
- the offer validity date;
- the administrator's message and terms;
- controls to accept or decline the offer.

Accepting the offer immediately confirms the direct booking. Before confirmation, the application transactionally:

1. locks the relevant availability calendar;
2. checks Airbnb and other stored blocks again;
3. checks other pending, offered, confirmed or approved requests sharing the same availability;
4. marks the offer accepted and the booking `confirmed` only when the dates remain available.

A replacement offer supersedes the earlier active offer, but the stable customer page remains unchanged and displays the latest published offer.

## Confirmed booking page

After acceptance, the same private page becomes the customer's confirmed booking record. It displays the current details, confirmed price, terms, booking reference and confirmation time.

When an email address was supplied, the application attempts to send a confirmation copy containing the same page link. Email failure does not affect the confirmed status. When no email address was supplied, the response is simply recorded on the page.

A later development phase can add amendment requests and other booking functions without changing the customer link or booking reference.

## Declined, expired and cancelled bookings

An active offer is valid through its `valid_until` date. On the following day it is marked `expired` and can no longer be accepted or declined online.

Declined, expired and cancelled states remain visible on the stable customer page. Declined and expired records are hidden from the normal administration bookings list by default and can be revealed with **Show declined and expired**. The same optional filter is available in each booking's offer history.

## Optional emails

Email is now a supplementary notification channel rather than the mechanism that grants access to the booking.

The administration offer form can:

- publish without sending an email;
- publish and send an optional copy to the saved customer email address;
- leave the offer available on the customer page even when the email attempt fails.

After acceptance or decline, customer email is attempted only when an address was supplied. Management notifications remain separately configurable.

Configure the management recipient with:

```env
BOOKING_ADMIN_EMAIL=bookings@olrigbank.co.uk
```

Multiple addresses can be separated by commas or semicolons. When `BOOKING_ADMIN_EMAIL` is not set, `BOOKING_EMAIL_REPLY_TO` is used as the fallback. Existing `BOOKING_EMAIL_BCC` behaviour remains unchanged.

`BOOKING_PUBLIC_URL` can override the public origin used in email links. Render supplies it automatically from `RENDER_EXTERNAL_URL`; locally the incoming browser request origin is sufficient.

## Administration calendar and preview

The protected calendar distinguishes:

- confirmed direct bookings;
- provisional requests and active offers;
- Airbnb unavailable periods; and
- other stored calendar blocks.

The administrator-only customer preview can now display the booking from the initial request stage onwards, not only after confirmation.

## Audit history and migration

Booking activity records include the request, first customer-page view, offer publication, optional email outcomes, offer view, expiry, replacement, confirmation, decline and availability conflicts.

Migration `011_stable_customer_booking_page.sql`:

- adds a stable random customer-access token to every booking request;
- records the first customer-page view;
- separates offer publication from email delivery with `published_at`;
- adds `not_requested` as an email-delivery status;
- backfills stable page tokens and publication timestamps for existing records.

Database migrations run automatically from `site/docker-entrypoint.sh`.
