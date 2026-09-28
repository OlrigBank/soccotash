# E18-F03 — Acceptance within payment

Implemented on the task branch for iterative review; not merged or deployed.

Accepted by the owner. Subsequent continuation improvements and final checks are
recorded in [E18-F04](e18-f04-final-verification.md).

The Make a payment page now shows payment methods immediately. The separate
“Your offer is ready” section, acceptance button and offer/decline link have been
removed from this page. Its required checkbox reads:

> I have reviewed and accept the booking and cancellation terms and the content
> of the reservation summary.

Both named sections are linked from the checkbox label. The payment schedule
shows the deposit or full payment and remaining balance before acceptance,
using the same pricing rules as the eventual accepted payment plan.

Submitting Pay by card or Request bank transfer details records acceptance and
ends saved date/contact editing. Selecting a method or ticking the checkbox
alone does neither. Bank account details remain hidden until the request is
submitted. Requesting them leaves the booking awaiting payment, not confirmed.
Card-provider failure retains the recorded acceptance and allows payment retry.
Existing accepted bookings and later balance payments retain their payment flow.

The server requires acceptance, rechecks availability and rejects stale booking
revisions, replaced offers and changed payment terms before proceeding. Acceptance
evidence records the payment method and the scope of consent in booking activity;
the existing accepted offer and payment-terms snapshot remain the source of truth.

## UI pattern names

- **Payment acceptance checkbox** — native required checkbox with native links
  to the terms and reservation summary.
- **Bank details request** — custom progressive-disclosure flow using a native
  POST form and server redirect.
- **Payment schedule preview** — custom semantic summary of the existing payment
  rules before acceptance.

## Verification — 28 September 2026

- Astro check: zero errors or warnings, two pre-existing admin hints. Build passed.
- Booking lifecycle: 90 tests passed. Direct-offer integration: six tests passed,
  including stale payment terms, acceptance evidence and idempotent acceptance.
- Playwright: all 12 request-journey and six payment-layout tests passed at
  390 × 844, 768 × 1024 and 1440 × 900. Includes both payment actions, unchecked
  browser and server validation, stale tabs, edit boundaries, bank disclosure,
  card-provider error recovery and existing payment states.
- Chrome DevTools inspected the rebuilt application at the same three widths:
  accessible checkbox/links and headings, visible validation focus, no document
  or unintended local overflow. Bank acceptance returned POST 303 then GET 200,
  revealed details, removed edit links and did not confirm the reservation.
  No browser console errors were observed.
- Mobile and desktop Lighthouse: Accessibility 100, Best Practices 100, Agentic
  Browsing 100, SEO 66. The sole failed audit is intentional private-page indexing
  prevention. This tool does not include performance scoring.
- Disposable local fixtures only: no real payment, notification or external
  calendar request. Hosted Stripe success was not exercised against a live provider.

Review at <http://127.0.0.1:8085/__request-preview/> with any name and
`journey@example.test`. This starts a fresh disposable booking; previous preview
links are invalidated when the fixture server restarts.
