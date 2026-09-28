# Booking payment page

Standard priced Cottage and Main House requests continue from verified Your
details to `/payment/`, creating the booking reference at that point. Saved
summary edits reuse that reference and recheck prices and availability. Bespoke
and promotion-code requests retain review and submission, then show a review
state until an administrator publishes an offer. On Make a payment, the Booker
accepts the booking and cancellation terms and reservation summary when starting
card checkout or requesting bank details. The accepted pricing plan determines the deposit or full
amount due now and the balance deadline.

Either payment action ends saved editing. Requesting bank details does not
confirm payment or the reservation; see the
[payment acceptance record](features/e18-f03-payment-acceptance.md).

Your bookings and saved root booking URLs resume unfinished requests at payment.
Once the Booker reports a bank transfer sent, they open the main booking page
while payment awaits verification, as recorded in
[E18-F06](features/e18-f06-transfer-booking-home.md).
After verified payment, they open the reservation workspace. Saved Edit links
preserve their requested step through sign-in. See the
[public journey integration record](features/e18-f05-public-journey-integration.md).

Configure `BOOKING_BANK_PAYEE`, `BOOKING_BANK_SORT_CODE` and
`BOOKING_BANK_ACCOUNT_NUMBER` in the service environment to show transfer
instructions. The booking reference is the transfer reference. Reporting a bank
transfer leaves the booking awaiting administrator verification.

The admin Bookings dashboard shows **Check transfer received**, including a
separate balance check for an already confirmed booking. If the money has not
arrived, the administrator uses **Transfer not received** and **Send message and
reopen payment**. The explanation becomes a visible administrator message in the
permanent conversation in the same transaction as the rejected payment report.
The Booker can use **Make a payment** from that conversation, choose card or bank
again, and request bank details afresh. Accepted booking details and terms stay
in place; previous payment attempts remain in the history. A new report returns
to the main booking page and requires another admin check. See the
[transfer retry record](features/e18-f07-transfer-retry.md) for regression coverage.

Configure `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` to enable hosted card
checkout. Register `POST /api/stripe-webhook/` in Stripe for
`checkout.session.completed`, `checkout.session.async_payment_succeeded`,
`checkout.session.async_payment_failed` and `checkout.session.expired`.
Use separate Stripe test and live webhook secrets. A signed, paid webhook records
the card payment and confirms the initial booking; returning from Checkout does
not. The same page can collect a later balance.

Checkout attempts are stored separately from payment history. A late payment
for a cancelled or already paid stage is marked for refund and an automatic
refund is requested. Inspect `refund_required` attempts and the matching Stripe
payment if the refund request fails. Provider errors and missing configuration
leave the bank route available when its account details are configured.

## Verification record

- Built the Astro server and ran `astro check` with no errors; the booking
  lifecycle suite passed all 88 tests. Isolated PostgreSQL tests covered card
  Checkout creation, session reuse, signed webhook verification, confirmation,
  replay and late payment; the existing bank transfer history test also passed.
- Playwright checked request submission and immediate offers at 390, 768 and
  1440 pixels. Chromium DevTools Protocol inspection of the rebuilt local app
  checked the review, offer, payment, bank details, confirmed and later-balance
  states at phone, tablet and desktop widths. The document had no horizontal
  overflow, headings and controls had accessible names, keyboard focus was
  visible, and there were no console errors or failed requests.
- With disposable card configuration, the card button appeared. Native form
  validation kept an unchecked transfer report on the page and focused its
  checkbox. A verified full-payment fixture showed the confirmed state without
  another payment action.
- Lighthouse on the production build at 390 × 844 reported accessibility 100,
  best practices 100 and performance 80. The existing reservation page scored
  100, 100 and 82 respectively under the same local conditions. Both private
  pages scored 66 for SEO because they intentionally block indexing. Shared
  styles and header image dominated the remaining performance opportunities.
- The final sticky mobile bar was checked in the rebuilt page using DevTools
  layout and accessibility data: it appeared at 390 pixels, stayed hidden at
  768 and 1440 pixels, and caused no overflow or console errors. A repeated
  Lighthouse capture returned `NO_FCP`; Chromium screenshot capture also timed
  out on the existing reservation page in the same environment. The earlier
  successful audit predates the bar, so the final layout has no valid score.
- Browser verification used disposable local bookings and dummy account
  details. It did not initiate a real transfer, charge a card, contact a
  customer, or exercise a live Stripe account.
