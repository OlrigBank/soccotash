# E18-F00 — Rewrite payment page

## Status

Implemented on the current agent branch. The page now follows the supplied
reference content and layout while retaining Olrig Bank branding and the
existing payment integrations.

## Delivered

- Added a progressive payment method selector for credit card and bank
  transfer.
- Added an Olrig property summary with image, dates, nights, guests, contact
  details, booking reference and expandable rental/fee sections.
- Added total, amount-due, balance and payment-deadline summaries.
- Added cancellation policy and configured security-deposit presentation.
- Added a responsive payment action bar with state-aware `Pay` and
  `Confirm reservation` actions.
- Added property-level security-deposit configuration, captured in accepted
  payment-term snapshots.

## UI patterns

- **Payment method selector** — custom stateful pattern using native links and
  forms.
- **Reservation summary card** — custom responsive summary pattern.
- **Expandable price groups** — native `<details>` controls.
- **Policy summary block** — custom semantic content pattern.
- **Responsive payment action bar** — custom responsive pattern using native
  form buttons.

## Verification

- `npm --prefix site run check` — 0 errors and 0 warnings; two existing hints
  remain in unrelated admin pages.
- `npm --prefix site run build` — passed.
- `npm --prefix site run test:booking-lifecycle` — 90 tests passed.
- Focused payment-term and cancellation tests passed, including configured
  security-deposit snapshotting.
- Chrome DevTools/Lighthouse verification remains required against a running
  local fixture at 390px, 768px and 1440px. The current execution environment
  blocks local HTTP listening and has no browser surface available, so that
  inspection could not be completed here.

## Assumptions

- Olrig Bank branding and property assets remain in use.
- Standard Olrig Bank and Cottage stays use a configured £150 security deposit,
  authorised on arrival day and released two days after departure.
- Promo-code content is informational until a real promo-code workflow exists.
