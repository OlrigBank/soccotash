# Human-only booking conversation

Olrig Bot booking-status and optional-email notices remain in `booking_messages` and their existing activity records. Booker and administrator conversation queries omit bot rows, including polling responses. The shared conversation renders only messages from people, and its bot-only state displays “No messages yet”. Administrator unread badges count only human messages. Reservation and status changes continue to trigger the existing conversation refresh notice.

The **Human-only conversation** is a custom UI pattern using the existing message list and composer.

## Verification

- Astro check and production build passed. The isolated Booker integration suite passed 17 tests, including database retention, both viewer queries, pagination across a bot notice and human-only unread counts.
- Playwright checked the Booker and administrator conversations at 320, 390, 768 and 1440 pixels. It covered bot-only empty state, existing human messages, a newly polled human message, both polling APIs, the administrator unread badge, console errors and document overflow.
- Chrome DevTools Protocol inspected the rebuilt Booker conversation at 390, 768 and 1440 pixels. Human message text appeared in the accessibility tree; bot names and bodies did not. Focus remained visible, the document and message list fitted their viewports, and there were no console exceptions or failed network responses.
- Lighthouse on a disposable local Booker conversation scored 100 for accessibility and 100 for best practices, with no applicable failures.
- Browser work used disposable local accounts and bookings with no customer contact or live notification delivery. The fixtures were removed afterward.
