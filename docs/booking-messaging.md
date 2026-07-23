# Booking messaging

The private booking page and the administrator booking page now use a shared, conversation-first interface.

## Participants

- **Booker** is the contact who made and manages the booking. The word **guest** remains in use for party size and the people staying.
- A manually composed administrator message uses the logged-in administrator's display name.
- **Jenna** is the default display name when an administrator is created without an explicit name.
- **Olrig Bot** records friendly booking-status and optional-email notices. Technical events remain in the separate booking activity log.

Messages are immutable. They cannot be edited or deleted independently of the booking record.

## Interface

Messaging is the primary panel on both sides. The **Reservation** button opens a right-hand drawer containing:

- current booking status and reference;
- stay and Booker details;
- the recorded or current price breakdown;
- additional terms;
- offer publication controls for administrators;
- accept and decline controls for an active Booker offer.

The conversation polls every eight seconds for new messages. It also compares a reservation version so a revised offer, status change, or replacement price prompts the viewer to refresh the reservation drawer.

## Email notifications

Email is optional and is not the booking record. A sender can select an email-copy checkbox when the relevant address and provider configuration are available.

- Administrator message copies go to the saved Booker email address.
- Booker message notifications go to `BOOKING_ADMIN_EMAIL`, falling back to `BOOKING_EMAIL_REPLY_TO`.
- Message delivery success or failure is stored against the message.
- A failed email does not remove or roll back the conversation message.

## Unread messages

Each message stores separate Booker and administrator read timestamps. Opening or polling a conversation marks messages read for that viewer. The administrator bookings list shows the count of unread conversation items and offers an **Open messages** action.

## Existing booking history

Migration `site/db/012_booking_messaging.sql` creates `booking_messages` and imports existing history without changing the original records:

- the initial Booker request message;
- previous administrator offer messages;
- offer publication and response events;
- confirmation, expiry, decline, and email-copy notices.

Imported history is marked read so deployment does not create a false backlog of unread messages.

## Deployment

No new environment variables are required. Normal container startup runs migration `012_booking_messaging.sql` automatically. Existing email settings continue to control optional notification copies.
