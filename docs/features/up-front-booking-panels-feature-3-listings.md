# Feature 3 — Listing-page Booking Panels

## Parent epic

[Up-front Booking Panels on the Landing and Listing Pages](./epics/getting-a-booking-panel%20on%20the%20landing%20page-and%20every-listing-page.md)

## Objective

Let visitors check a standard stay from the opening of its listing without
selecting the arrangement again or leaving for the generic booking form.

## Scope

- Add the compact panel to Olrig Bank, The Cottage at Olrig Bank and Olrig Bank
  Max through their authoritative listing-to-property configuration.
- Fix each panel to its listing's arrangement and do not render a selector.
- Place the description and panel side by side where desktop width permits.
- Stack the panel after the opening description and before the listing image,
  prose, gallery and room content at smaller widths.
- Replace the opening Check availability button while retaining a restrained
  WhatsApp route for questions.
- Reduce the later enquiry section to contact help for needs the checker does
  not cover.

Olrig Bank Bespoke remains the separately delivered Feature 4 because its
administrator-priced enquiry presentation must not imitate a standard check.

## Listing mapping

- `olrig-bank` → `main-house`
- `cottage` → `cottage`
- `event` → `whole-property`

## Validation

- Listing-to-arrangement contract tests.
- Complete booking-lifecycle contract suite.
- Astro check and production build.
- Browser review at the epic's required phone, tablet and desktop widths.
