# Booking payment flow

The direct booking flow is now:

1. Booker requests a booking.
2. An administrator publishes an offer.
3. The Booker accepts the offer; the booking changes to `payment_pending`.
4. The booking page shows a calculated deposit (25% by default, configurable with `BOOKING_DEPOSIT_PERCENT`).
5. GoCardless Pay by Bank and Stripe card payment are displayed as disabled integration stubs.
6. Manual bank transfer can be reported by the Booker when exceptionally agreed with Olrig Bank.
7. Reporting the transfer changes the booking to `payment_reported`. It does **not** confirm the booking or record the money as received.
8. The administrator opens the payment-verification screen from the bookings list and checks the Olrig Bank account.
9. Administrator verification changes the booking from `payment_reported` to `confirmed`, records receipt and adds an Olrig Bot message to the permanent conversation.
10. If the transfer cannot be verified, the administrator records a reason and returns the booking to `payment_pending`; the Booker can report payment again later.
11. The remaining balance is retained on the booking record for later collection through the same management page.

The transition decisions are supplied by the canonical lifecycle module. The runtime payment service locks the booking row, asks the lifecycle module for the applicable rule, applies the expected source and destination statuses conditionally, records the rule event, and commits the messages and status change in one transaction.

The manual-transfer workflow relies on an administrator checking the bank account. A Booker declaration alone is never treated as proof of payment.
