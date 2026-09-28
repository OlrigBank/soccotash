# E18-F06 — Transfer confirmation opens the booking home

The owner clarified that confirming a bank transfer was sent must open the
Booker's main page at `/booking/manage/<booking-reference>/`. This supersedes
the payment-page continuation introduced in E18-F04.

Both a newly reported transfer and a repeated report now redirect to that root
URL with the existing confirmation notice. The root renders the booking workspace
while a transfer awaits verification, rather than redirecting back to payment.
Returning through Your bookings follows the same rule. This includes a reported
balance on a booking with an already verified deposit. Reporting a transfer still
does not verify receipt or confirm an unpaid reservation.

**Transfer-to-booking continuation** — custom server navigation using the existing
native form and existing booking workspace; no new visual control.

Verification on 28 September 2026:

- Build and Astro check passed: zero errors/warnings, two existing admin hints.
- All 91 lifecycle tests and 12 request-journey Playwright tests passed. Updated
  destination coverage includes initial and balance transfers awaiting verification.
- Chrome DevTools exercised the rebuilt local form and confirmed the root URL,
  the transfer-reported notice, keyboard navigation to Messages with visible focus,
  and no document overflow at 390 × 844, 768 × 1024 and 1440 × 900. No console
  errors were observed; the inspected booking documents returned HTTP 200.
- Mobile Lighthouse: Accessibility 100, Best Practices 100, Agentic Browsing 100,
  SEO 66 (intentional private-page indexing prevention). No performance score is
  provided by this tool.
- The owner's LAN example could not be inspected because Chrome reported an
  untrusted certificate. Verification used disposable local records and did not
  alter that booking, send customer notifications or record a real payment.

Implemented on the task branch; nothing merged or deployed.
