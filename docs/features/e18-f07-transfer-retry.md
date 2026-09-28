# E18-F07 — Transfer not received and payment retry

Accepted by the owner. Final regression and merge-readiness evidence is recorded
in [E18-F08](e18-f08-merge-readiness.md).

When the Booker reports a transfer, the admin Bookings dashboard offers **Check
transfer received** beside the status. A reported balance has its own check even
though the booking remains confirmed. The administrator can use **Transfer not
received**, enter a message and select **Send message and reopen payment**.

The message, rejected payment decision and activity record are committed
together. The explanation is attributed to the administrator and initially
unread for the Booker. Duplicate or stale decisions cannot send another message.
The implementation previously stored the explanation only as a system message;
the conversation deliberately hides these messages. A regression test exposed
this gap and now exercises the actual visible administrator message.

The conversation and reservation show a **Make a payment** link after rejection.
An already-open conversation receives the message through polling and offers
**Refresh this page** to reveal the retry action. Payment changes are included in
the refresh version, covering a balance rejection without a booking-status change.
The retry link disappears when payment is reported again or verified.

The chosen interpretation of “first time through” restarts payment selection:
card is offered again, bank details must be requested afresh, and the transfer
confirmation checkbox starts unchecked. It retains the accepted stay, price,
contact details and terms, including the existing payment deadlines. Reopening
stay/contact editing or requiring acceptance again was raised separately and
has not been assumed. Previous reports and decisions are never removed. A new
report opens the main booking page as agreed in E18-F06 and requires a new admin
receipt check. Rejecting a balance does not undo the booking's confirmation.

UI patterns:

- **Transfer receipt check** — custom dashboard status/action using native links.
- **Transfer not received message** — custom transactional workflow using a
  native required textarea and submit button, displayed in the existing message board.
- **Payment retry notice** — custom notice with native message/payment links;
  reuses the existing payment-method navigation, bank-details form and checkbox.

Verification on 28 September 2026:

- Build and Astro check passed with zero errors/warnings and two existing admin
  hints. All 91 lifecycle tests passed.
- All 15 request-journey Playwright cases passed at 390 × 844, 768 × 1024 and
  1440 × 900. The new case covers deposit and balance reporting, the dashboard
  action, empty-message validation, rejection, live message arrival and refresh,
  keyboard continuation, fresh bank details, a new report, verification and the
  retained rejected/verified history. Existing request/edit/acceptance cases pass.
- The isolated PostgreSQL payment-history integration test passed, including
  administrator attribution, unread message, duplicate decision protection,
  deposit and balance attempts, stale decisions and cancellation.
- Chrome DevTools inspected the rebuilt dashboard, payment decision form,
  conversation and retry page at the same three widths. No document overflow;
  the existing admin tables scroll locally on narrow viewports. The empty-message
  submission focused the required textarea with a visible outline. Keyboard
  navigation focused and activated Make a payment with a visible 3px outline.
  Accessible names and message content were checked in the accessibility tree.
  No inspected console errors; bank-details POST returned 303 followed by GET 200.
- Mobile Lighthouse on the conversation and bank retry page: Accessibility 100,
  Best Practices 100, Agentic Browsing 100, SEO 66. The sole failing audit is the
  intentional no-index policy for private booking pages. The tool does not give
  a performance score. Reports are in `/tmp/e18-retry-lighthouse` and
  `/tmp/e18-retry-payment-lighthouse` for this session.
- All checks used disposable local accounts, bookings and dummy bank details.
  External notifications were disabled; notification failure preserved the
  conversation and reopened payment. No real transfer, live provider or customer
  notification was exercised.

Accepted on the task branch; nothing merged or deployed.
