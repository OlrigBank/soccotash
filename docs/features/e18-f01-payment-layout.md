# E18-F01 — Payment layout review milestone

## Status

Implemented on `feat/e18-finalise-payment-page`, ready for local layout review.
This is the first E18 milestone, not completion of the epic. Nothing has been
merged or deployed. Review and iterate on this stage before starting the next.

## Delivered

- Two responsive panels: Payment details and Reservation summary. Dates, guests,
  booking reference and contact details appear together in the summary, alongside
  the existing price breakdown, total and payment schedule.
- Card and bank-transfer selection displays one payment method at a time. Native
  links work with the keyboard, without JavaScript, and retain selection on reload.
- Hosted Stripe Checkout remains the card route. Existing payment states,
  acceptance, transfer reporting and payment confirmation behaviour remain.
- The phone payment bar no longer covers the payment heading after following a
  method link. Transfer validation has a visible focus outline.

## Agreed next stages

- Standard journey: Check your stay → Your details → Make payment. Contact
  verification and booking-reference creation complete step 2. Bespoke requests
  keep the review-and-send route.
- Add summary edit controls returning to the earlier steps with saved data,
  updating the same booking and rechecking availability, prices and verification.
- Require an acceptance checkbox before starting card checkout or requesting
  bank-transfer details; record acceptance on either action. Both actions end
  self-service date/contact editing. Subsequent changes use booking messages.
- Requesting bank details does not confirm payment or a reservation. Preserve
  existing payment verification, deposit and balance rules. Add no new discount
  or security-deposit functionality.

The progress trail, summary edit controls and revised acceptance flow belong to
these next stages; the layout milestone deliberately retains their current flow.

## Local review

Run `npm run preview:payment` from the repository root, using the local PostgreSQL
configuration in `.env` or a local `DATABASE_URL`. Open:

- Card: <http://127.0.0.1:8083/__payment-preview/>
- Bank: <http://127.0.0.1:8083/__payment-preview/?method=bank>
- Other states: add `state=pending`, `state=offered`, `state=confirmed`,
  `state=cancelled`, `state=payment_reported` or `state=balance`.

The preview serves the rebuilt application on loopback, signs into disposable
fixtures and uses dummy bank/Stripe configuration. External fetches are blocked
and notification credentials are removed. Clicking the card payment button
demonstrates the recoverable provider-error state; it does not open live Checkout.
Stop with Ctrl+C to remove the fixtures. Restart after an hour to renew sessions.
The preview entry route exists only in the test runner, not the production app.

## UI pattern names

- **Payment and reservation panels** — custom responsive two-panel pattern.
- **Payment method selector** — custom styled selector using native links and
  `aria-current`; these are navigation links, not ARIA tabs.
- **Reservation summary** — custom summary using semantic sections and lists.
- **Price breakdown disclosure** — native browser details/summary control.
- **Mobile payment bar** — custom sticky summary and navigation pattern.
- **Hosted card checkout** — existing Stripe-hosted control.
- **Transfer declaration** — native required checkbox within the existing form.

## Verification — 28 September 2026

- `npm --prefix site run check`: 0 errors, 0 warnings; two pre-existing hints in
  unrelated admin pages.
- `npm run build`: passed.
- `npm run test:payment-layout`: six Playwright tests passed across 390 × 844,
  768 × 1024 and 1440 × 900. Coverage includes method selection and persistence,
  keyboard activation, transfer validation/focus, mobile anchor visibility,
  disclosures, the single summary, and review/offer/confirmed/cancelled/reported/
  later-balance states. Unpriced requests show “Price to be agreed”.
- Chrome DevTools inspected the rebuilt application at the same widths: no
  document or unintended local overflow, named landmarks/controls and logical
  headings. Checked keyboard selection, visible focus, blocked unchecked transfer
  submission, method GET navigation and provider-error recovery. No browser
  console errors or failed asset/document requests were observed.
- DevTools found the sticky phone bar covered the payment heading after method
  navigation. Added a scroll offset and a regression assertion; the rebuilt page
  places the heading below the bar (128px versus a 100px bar bottom at 390px).
- Final mobile and desktop Lighthouse audits: Accessibility 100, Best Practices
  100, Agentic Browsing 100, SEO 66. The sole failed audit is the intentional
  private-page indexing block. Audits were repeated after the layout correction.
  The DevTools Lighthouse tool does not include a performance score.
- Limitations: disposable local fixtures only; no real customer contacted, live
  Stripe checkout, real transfer or new booking journey exercised at this stage.
