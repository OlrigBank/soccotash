# Booking payment flow

The direct booking flow is now:

1. Booker requests a booking.
2. An administrator publishes an offer.
3. The Booker accepts the offer; the booking changes to `payment_pending`.
4. The booking page shows a calculated deposit (25% by default, configurable with `BOOKING_DEPOSIT_PERCENT`).
5. GoCardless Pay by Bank and Stripe card payment are displayed as disabled integration stubs.
6. Manual bank transfer can be reported by the Booker when exceptionally agreed with Olrig Bank.
7. Reporting the transfer changes the booking to `confirmed` and creates separate Olrig Bot messages for the administrator and Booker. The administrator message explicitly asks for bank-account verification.
8. The remaining balance is retained on the booking record for later collection through the same management page.

The manual-transfer confirmation is based on the Booker's declaration that payment was sent. It does not perform bank reconciliation.
