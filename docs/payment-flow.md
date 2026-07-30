# Booking payment flow

The direct booking flow is now:

1. Booker requests a booking.
2. An administrator publishes an offer.
3. The Booker accepts the offer; the booking changes to `payment_pending`.
4. The accepted booking snapshots its payment terms from the applicable published pricing plan:
   - deposit percentage;
   - initial-payment deadline in calendar days after acceptance; and
   - balance-payment deadline in calendar days before arrival.
5. For the first live-booking phase, manual bank transfer is the only active payment method.
6. GoCardless Instant Bank Pay and Stripe Checkout remain clearly disabled integration stubs.
7. Reporting the transfer changes the booking to `payment_reported`. It does **not** confirm the booking or record the money as received.
8. The administrator opens the payment-verification screen from the bookings list and checks the Olrig Bank account.
9. Administrator verification changes the booking from `payment_reported` to `confirmed`, records receipt and adds an Olrig Bot message to the permanent conversation.
10. If the transfer cannot be verified, the administrator records a reason and returns the booking to `payment_pending`; the Booker can report payment again later.
11. The remaining balance is retained on the booking record for later collection through the same management page.

The launch defaults are 25% deposit, initial payment due seven calendar days after acceptance, and balance due 42 calendar days before arrival. Acceptance on or after the balance-due date requires the full accepted total as the initial payment. These values are seeded as rules on existing plans and are not global environment settings.

The calculated initial-payment amount, initial-payment deadline, remaining balance, balance date and rule values are stored on the booking at acceptance. Later pricing-plan changes do not alter an accepted booking.

The transition decisions are supplied by the canonical lifecycle module. The runtime payment service locks the booking row, asks the lifecycle module for the applicable rule, applies the expected source and destination statuses conditionally, records the rule event, and commits the messages and status change in one transaction.

The manual-transfer workflow relies on an administrator checking the bank account. A Booker declaration alone is never treated as proof of payment.
