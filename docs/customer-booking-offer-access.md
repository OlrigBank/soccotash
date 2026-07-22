# Customer booking and offer access

Each newly sent booking offer contains a secure customer link shaped like:

```text
https://soccotash.onrender.com/booking/manage/<random-token>/
```

The token is the credential. It is generated from 32 random bytes and only its SHA-256 hash is stored in PostgreSQL. The URL does not expose the booking UUID, customer name, or email address.

## Offer stage

While an offer is active, the secure page displays:

- property and stay dates;
- guest and contact details;
- the offered price lines and total;
- the offer validity date;
- the administrator's message and terms;
- controls to accept or decline the offer.

Accepting the offer immediately confirms the direct booking. Before confirmation, the application transactionally:

1. locks the relevant availability calendar;
2. checks Airbnb and other stored blocks again;
3. checks other pending, offered, confirmed, or approved requests sharing the same availability;
4. marks the offer accepted and the booking `confirmed` only when the dates remain available.

## Confirmed booking page

After acceptance, the same secure link becomes the customer's confirmed booking page. It displays the current booking details, confirmed price, terms, booking reference, and confirmation time.

The confirmation email contains the same secure link. The page is retained after the original offer validity date because accepted offers are no longer subject to expiry.

A later development phase can add amendment requests to this page without changing the customer link or booking reference.

## Declined, expired, and replacement offers

An active offer is valid through its `valid_until` date. On the following day it is marked `expired` and can no longer be accepted or declined online.

Sending a replacement offer marks earlier active offers as `superseded` and revokes their tokens. The customer must use the link from the most recent offer email.

Declined and expired booking records are hidden from the normal administration bookings list. Administrators can reveal them with **Show declined and expired**. The same optional filter is available in each booking's offer history.

## Emails

After acceptance, the application immediately attempts to send:

- a customer booking-confirmation email containing the secure booking-page link; and
- a management notification that a direct booking was confirmed.

After a decline, corresponding customer and management notifications are attempted.

Configure the management recipient with:

```env
BOOKING_ADMIN_EMAIL=bookings@olrigbank.co.uk
```

Multiple addresses can be separated by commas or semicolons. When `BOOKING_ADMIN_EMAIL` is not set, `BOOKING_EMAIL_REPLY_TO` is used as the fallback. Existing `BOOKING_EMAIL_BCC` behaviour remains unchanged.

`BOOKING_PUBLIC_URL` can override the public origin used in links. Render supplies it automatically from `RENDER_EXTERNAL_URL`; locally the incoming browser request origin is sufficient.

## Administration calendar

The protected calendar page shows three months at a time and distinguishes:

- confirmed direct bookings;
- provisional requests and active offers;
- Airbnb unavailable periods; and
- other stored calendar blocks.

Confirmed direct bookings are clickable. They open an administrator-only preview rendered from the same booking-view component used by the customer's secure link.

## Audit history and migration

Booking activity records include offer delivery, first customer view, expiry, replacement, confirmation, decline, availability conflicts, and email delivery outcomes.

Migration `010_confirmed_direct_bookings.sql`:

- adds the `confirmed` booking status and `confirmed_at` timestamp;
- upgrades existing `offer_accepted` bookings to `confirmed`;
- adds an index for confirmed booking dates.

Database migrations run automatically from `site/docker-entrypoint.sh`.
