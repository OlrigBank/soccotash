# Booking request review and customer offers

## Administration workflow

The bookings list now uses the first column for the current **bottom-line price** rather than the UUID reference. It shows the most recently published offer total when one exists; otherwise it shows the provisional total recorded when the request was submitted.

Open **Review** to see:

- guest and stay details;
- the request reference;
- the immutable published-plan calculation recorded at submission;
- an editable customer offer calculation;
- previous published offers and optional email attempts.

The administrator can change labels, explanations and amounts, add or remove lines, and use negative lines for discounts. The original submitted pricing snapshot is not overwritten.

When **Publish offer** is selected:

1. a `booking_offers` record is created;
2. the offer is published immediately on the customer's stable booking page;
3. the request becomes `offered` independently of email delivery;
4. when **Also email a copy** is selected, the application attempts delivery after publication;
5. an email failure is recorded but does not remove or deactivate the published offer.

`pending`, `offered`, `confirmed` and `approved` bookings continue to block the associated calendar dates.

## Stable customer booking page

Submitting the public request now creates a random customer-access token and redirects the browser directly to `/booking/manage/<token>/`. The customer is told to bookmark or copy this address. The same page shows the pending request, later published offers, the accept/decline controls and the confirmed booking.

The public email field is optional. This allows the complete booking process to continue through the private page without requiring email, while retaining email as an optional notification and backup channel.

## Email configuration

Two delivery methods are supported without an additional package dependency.

### SMTP

Set:

```text
EMAIL_PROVIDER=smtp
BOOKING_EMAIL_FROM=Olrig Bank <olrig.bank@gmail.com>
BOOKING_EMAIL_REPLY_TO=olrig.bank@gmail.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=olrig.bank@gmail.com
SMTP_PASSWORD=<app password>
SMTP_TLS_REJECT_UNAUTHORIZED=true
```

For Gmail, use an app password rather than the normal account password. Port 587 with `SMTP_SECURE=false` is also supported; the application requires STARTTLS before sending credentials.

### Resend

Set:

```text
EMAIL_PROVIDER=resend
BOOKING_EMAIL_FROM=Olrig Bank <bookings@a-verified-domain.example>
BOOKING_EMAIL_REPLY_TO=olrig.bank@gmail.com
RESEND_API_KEY=<key>
```

`BOOKING_EMAIL_BCC` is optional for either provider and accepts comma-separated addresses.

## Database migration

Migration `008_booking_offer_review.sql` creates the original offer-review records. Migration `011_stable_customer_booking_page.sql` adds the stable customer token, separates publication from email delivery and adds the `not_requested` delivery status.

A published offer does not replace the original published pricing snapshot in `provisional_bookings`.

## Contact correction and request deletion

The booking review screen now shows the supplied contact number as a separate field. When no number was supplied it displays **None supplied** rather than leaving the field absent.

The saved customer email address can be corrected or cleared before an offer is published. Selecting **Save email address** updates `provisional_bookings.guest_email`; a blank value means that email copies are not available. The previous and replacement values are retained in the administrator audit log, while each offer records the recipient used for any requested delivery attempt.

Pending and offered requests can be permanently deleted from the review screen. Deletion requires both a confirmation checkbox and a browser confirmation prompt. It removes the request, cascades to its offer history, and releases the dates previously blocked by that provisional request. Approved requests cannot be deleted through this control.

## Confirmed direct bookings

An accepted offer changes the request status directly to `confirmed`. The stable customer page immediately becomes the confirmed booking record. When an email address exists, the application attempts to send a confirmation copy containing the same link; confirmation does not depend on that email succeeding. The page is intended to support amendment requests in a later phase.

The administration bookings list hides declined and expired records by default. They remain stored and can be revealed with **Show declined and expired**. Individual offer histories use the same default hiding behaviour.

The administration calendar distinguishes confirmed direct bookings from provisional requests and Airbnb blocks. Clicking a confirmed direct booking opens an administrator-only preview of the current customer booking page.
