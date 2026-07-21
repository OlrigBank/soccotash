# Customer booking-offer access

This phase adds a secure customer page to every newly sent booking offer.

## Customer workflow

When an administrator sends an offer from `/admin/bookings/<reference>/`, the email now contains a **View and respond to your offer** button. The button opens a URL shaped like:

```text
https://soccotash.onrender.com/booking/manage/<random-token>/
```

The token is the credential. It is generated from 32 random bytes and only its SHA-256 hash is stored in PostgreSQL. The URL does not expose the booking UUID, customer name, or email address.

The page displays:

- property and stay dates;
- guest and contact details;
- the offered price lines and total;
- the offer validity date;
- the administrator's message and terms;
- the current customer-response status.

While the offer is active, the customer can accept or decline it. After responding, the same page remains available as a read-only record.

## Acceptance behaviour

Acceptance is transactional. Before recording it, the application:

1. locks the relevant availability calendar;
2. checks Airbnb/manual blocks again;
3. checks other pending, offered, accepted, or approved requests sharing the same availability;
4. records `offer_accepted` only when the dates are still available.

Acceptance records the customer's agreement to the offer. It is deliberately distinct from the existing final `approved` status so that Olrig Bank can complete any later confirmation or payment steps.

## Expiry and replacement offers

An offer is valid through its `valid_until` date. On the following day it is marked `expired` and can no longer be accepted or declined online.

Sending a replacement offer marks any earlier active offer as `superseded` and revokes the earlier token. The customer must use the link from the most recent offer email.

## Emails

After an acceptance or decline, the application attempts to send:

- a customer confirmation email; and
- a management notification email.

Configure the management recipient with:

```env
BOOKING_ADMIN_EMAIL=bookings@olrigbank.co.uk
```

Multiple addresses can be separated by commas or semicolons. When `BOOKING_ADMIN_EMAIL` is not set, `BOOKING_EMAIL_REPLY_TO` is used as the fallback. Existing `BOOKING_EMAIL_BCC` behaviour remains unchanged.

`BOOKING_PUBLIC_URL` can override the public origin used in links. Render supplies it automatically from `RENDER_EXTERNAL_URL`; locally the incoming browser request origin is sufficient.

## Audit history

Migration `009_customer_booking_management.sql` adds `booking_activity`. The administrator review page displays the activity timeline, including:

- offer sent or delivery failed;
- first customer view;
- offer expiry or replacement;
- acceptance or decline;
- availability-blocked acceptance attempts;
- customer and management notification results.

The customer page is returned with `no-store`, `no-referrer`, and `noindex` protections.

## Deployment

Database migrations run automatically from `site/docker-entrypoint.sh`. On the first deployment of this version, migration `009_customer_booking_management.sql` will add the new columns, statuses, indexes, and activity table.

Before testing on Render, set `BOOKING_ADMIN_EMAIL` in the web service environment. Then send a fresh offer: offers created before migration do not have customer-access tokens and therefore cannot acquire a link retrospectively.
