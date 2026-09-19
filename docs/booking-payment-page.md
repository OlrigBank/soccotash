# Booking payment page

After request submission, the private booking link opens `/payment/`. Standard
priced Cottage and Main House requests receive an immediate offer; other requests
show a review state until an administrator publishes one. The Booker must accept
the offer before paying. The accepted pricing plan determines the deposit or full
amount due now and the balance deadline.

Configure `BOOKING_BANK_PAYEE`, `BOOKING_BANK_SORT_CODE` and
`BOOKING_BANK_ACCOUNT_NUMBER` in the service environment to show transfer
instructions. The booking reference is the transfer reference. Reporting a bank
transfer leaves the booking awaiting administrator verification.

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
