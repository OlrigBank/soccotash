# Customer booking-page access

Every booking request receives one private page shaped like:

```text
https://olrig-bank.com/booking/manage/<random-token>/
```

The customer is redirected to this page immediately after selecting **Request booking**. The page is the continuing record for the request, administrator offer, Booker response, payment stage, conversation and confirmed booking.

The token is the credential. It is generated from 32 random bytes, is not derived from the booking UUID or contact details, and must be treated like a private password. The customer page sends `no-store`, `noindex` and `no-referrer` headers to reduce caching, search indexing and accidental link disclosure.

## Access lifetime

Private Booker access is valid through a configurable number of days after the departure date. The setting is:

```env
BOOKING_ACCESS_EXPIRY_DAYS_AFTER_DEPARTURE=90
```

The default is 90 days when the variable is absent or invalid. Accepted configured values are whole numbers from 1 through 3650.

A link remains valid on the calculated final day and is rejected from the following day. Expiry is enforced when the private page or its message-polling endpoint is requested; no scheduled cleanup job is required. Expiry blocks access but does not delete the booking, offer history, messages or technical activity.

Existing booking credentials are assigned their original booking creation time as the issue time by migration `014_booking_access_lifecycle.sql`.

## Administrator controls

The bookings list provides an **Access** action for every booking. The protected access screen displays:

- whether access is active, revoked or automatically expired;
- the issue time and last recorded use;
- the calculated automatic-expiry date;
- the configured expiry period and environment-variable name;
- the number of active offer-specific credentials.

### Generate a replacement link

Rotation generates a new random stable credential and immediately invalidates:

- the previous stable Booker link; and
- every older offer-specific link for the booking.

The replacement link is shown once on the administrator response page so it can be copied and tested. Rotation preserves the booking reference, status, offer history, conversation and activity history. A `booking_access_rotated` technical activity event and a protected administrator audit event are recorded.

A replacement cannot be generated after the booking has passed the configured automatic-expiry date. Extending that period requires an explicit configuration change.

### Revoke access

Revocation immediately blocks the stable link and every offer-specific link. A reason and explicit confirmation are required. The booking record remains intact and can be restored with a later rotation while its automatic access period remains open.

A `booking_access_revoked` technical activity event and a protected administrator audit event are recorded.

## Request enforcement

A central access resolver validates the credential format and resolves both stable booking credentials and legacy offer-specific credentials. It checks revocation and the configured departure-based expiry before the application loads the private booking page.

Because every Booker form action posts back to that protected page, the same gate covers:

- viewing the reservation and conversation;
- sending Booker messages;
- accepting or declining an offer;
- reporting a manual bank transfer; and
- subsequent page refreshes.

The message-polling API applies the same access resolver independently. Revoked offer credentials are also cleared by a database trigger, so older resolver code cannot continue using a credential after `token_revoked_at` is set.

A request that presents a known stable credential after revocation or automatic expiry receives the same not-found response as an unknown credential. The denial reason is recorded in technical booking activity without recording the token.

## Initial request stage

Before an offer exists, the page displays the property, dates, party size, supplied contact details, request reference, provisional price calculation when available, the initial message and an explanation of the next step.

The customer is told to bookmark the page or copy its address somewhere safe. Email is optional and is not required to create or continue a booking. Pending requests continue to block the associated availability calendar while Olrig Bank reviews them.

## Offer and payment stages

Publishing an offer makes it appear immediately on the same customer page. Publishing does not depend on successful email delivery. The administrator can optionally email a copy when the customer supplied an email address and an email provider is configured.

While an offer is active, the page displays its price lines, total, validity date, administrator message, terms and response controls.

Accepting the offer moves the booking to `payment_pending`; it does not confirm the booking. Reporting a manual bank transfer moves it to `payment_reported`. Only administrator verification moves it to `confirmed`. Administrator rejection returns it to `payment_pending` with the reason preserved in the conversation.

A replacement offer supersedes the earlier active offer. The database records revocation and clears the older offer credential, while the stable Booker page continues to display the latest published offer.

## Declined, expired, cancelled and confirmed records

Declined, expired, cancelled and confirmed states remain visible while Booker access itself remains active. Booking state and access state are separate: cancelling a booking does not silently delete its conversation, and revoking access does not change the booking status.

Declined and expired records are hidden from the normal administration bookings list by default and can be revealed with **Show declined and expired**.

## Privacy and analytics

The private route is not indexed and sends a no-referrer policy. Umami tracking replaces any `/booking/manage/<token>/` path with `/booking/manage`, so the credential is not included in analytics page URLs.

Rotation, revocation and denied-access activity details never store the credential itself.

## Migration and the next hardening phase

Migration `014_booking_access_lifecycle.sql` adds stable credential issue, revocation and last-use timestamps. It also clears already-revoked offer hashes and installs a trigger that clears any offer hash when the offer credential is revoked.

This lifecycle release deliberately retains the existing stable credential column so current email, bookmark and administrator workflows can be proven without a simultaneous transport migration. The next hardening phase will migrate stable credentials to hash-only storage and exchange URL credentials into a Secure, HttpOnly, SameSite cookie before redirecting to a token-free booking address.
