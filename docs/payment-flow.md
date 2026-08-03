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
   The configured booking administrators are notified automatically.
8. The administrator opens the payment-verification screen from the bookings list and checks the Olrig Bank account.
9. Administrator verification changes the booking from `payment_reported` to `confirmed`, records receipt and adds an Olrig Bot message to the permanent conversation.
   The Booker is notified automatically at the saved email address.
10. If the transfer cannot be verified, the administrator records a reason and returns the booking to `payment_pending`; the Booker can report payment again later.
    The Booker is notified automatically and the email includes the recorded reason.
11. Each report is stored permanently in `booking_payments`; rejection changes that report to `rejected` and preserves the reason rather than clearing the attempt.
12. After deposit verification, the Booker can report the remaining balance at any time before its deadline from the same private booking page.
13. Reporting, rejecting or verifying the balance leaves the booking `confirmed` and keeps the dates classified as a confirmed direct booking.
14. The administrator decides the exact reported payment record. Stale forms cannot decide a replacement report.
15. A verified balance displays the reservation as “Booking confirmed and fully paid”. Rejected and replacement attempts remain visible to both the Booker and administrator.

An administrator can cancel an active request or booking from its permanent booking record by entering a reason and explicitly confirming the action. Cancellation changes the status to `cancelled`, releases the dates, preserves the booking, conversation and decided payment history, and closes any currently reported payment as `cancelled`. It automatically emails the reason to the Booker. Email failure is recorded but does not roll back the cancellation.

The launch defaults are 25% deposit, initial payment due seven calendar days after acceptance, and balance due 42 calendar days before arrival. Acceptance on or after the balance-due date requires the full accepted total as the initial payment. These values are seeded as rules on existing plans and are not global environment settings.

The calculated initial-payment amount, initial-payment deadline, remaining balance, balance date and rule values are stored on the booking at acceptance. Later pricing-plan changes do not alter an accepted booking.

The transition decisions are supplied by the canonical lifecycle module. The runtime payment service locks both the booking and payment rows, asks the lifecycle module for the applicable rule, applies the expected source and destination states conditionally, records the rule event, and commits the payment decision, messages and any booking-status change in one transaction.

The manual-transfer workflow relies on an administrator checking the bank account. A Booker declaration alone is never treated as proof of payment.
