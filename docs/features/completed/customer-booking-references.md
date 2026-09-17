# Customer booking references

Bookings now have a customer reference in the form `OB-XXXXXXXX`. The eight random characters use `23456789BCDFGHJKMNPQRSTVWXYZ`: no zero, one, ambiguous letters or vowels. A database uniqueness constraint prevents two bookings from sharing a reference.

Migration `062_customer_booking_references.sql` assigns a reference to existing bookings and gives new bookings a database default. The existing UUID remains the internal identifier for routes, ownership checks, audit links and administrator workflows. Customer pages, payment instructions, booking lists and customer email copies display the new reference. Administration shows both references so a customer's reference can be matched to its record.

## Verification

- Astro check and production build passed. The booking lifecycle suite passed 267 tests; the Booker account and direct-offer integration suites passed 16 and 5 tests respectively.
- Playwright exercised the booking request, private page and account list at 320, 390, 768 and 1440 pixels. The priced offer and accepted-payment continuation passed at 390, 768 and 1440 pixels. The reference matched the database and remained stable on a submission replay.
- Chrome DevTools Protocol inspected the rebuilt private booking in the payment state at 390, 768 and 1440 pixels. The reference appeared in the accessibility tree; document width stayed within the viewport, keyboard focus was visible, and no console exceptions or failed network responses were observed.
- Lighthouse on a disposable local private booking in the payment state scored 100 for accessibility and 100 for best practices, with no applicable failures.
- Browser inspection used disposable local bookings, simulated SMS and a non-notifying email sink. It did not verify delivery through a live provider.

The customer reference is for identification and bank-transfer narration. It is not an access credential; private pages still require the existing authenticated UUID route.
