# Booking request review and customer offers

## Administration workflow

The bookings list now uses the first column for the current **bottom-line price** rather than the UUID reference. It shows the most recently emailed offer total when one exists; otherwise it shows the published provisional total recorded when the request was submitted.

Open **Review** to see:

- guest and stay details;
- the request reference;
- the immutable published-plan calculation recorded at submission;
- an editable customer offer calculation;
- previous email attempts and sent offers.

The administrator can change labels, explanations and amounts, add or remove lines, and use negative lines for discounts. The original submitted pricing snapshot is not overwritten.

When **Send offer and mark as offered** is selected:

1. a `booking_offers` record is created with delivery status `pending`;
2. the email provider is called;
3. after successful delivery acceptance, the offer is marked `sent` and the booking request becomes `offered`;
4. if delivery fails, the attempt is marked `failed` and the booking stays at its previous status.

`pending`, `offered` and `approved` requests continue to block the associated calendar dates.

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

Migration `008_booking_offer_review.sql`:

- adds `offered` to provisional-booking statuses;
- creates `booking_offers` with the reviewed line items, total, message, validity, recipient and delivery audit fields.

A sent offer does not replace the original published pricing snapshot in `provisional_bookings`.
