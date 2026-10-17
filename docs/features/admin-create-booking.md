# Create a booking from an offline request

Administrators can open **Bookings → Create booking**, enter a booker’s name
and email address or mobile number, and prepare a booking from an email or
telephone request. Eligible standard stays can have an active offer at the
current published price, ready for the booker to review and pay. Other requests
can be saved for review and offered through the existing booking workspace.

The contact is registered against the booking as its claim contact. It becomes
account ownership through the existing contact verification flow; entering it
in administration does not assert that it has been verified or issue a booker
session. The booker still accepts the price and terms before payment. Booking
creation and the administrator audit entry commit together. Availability checks
and locks reuse the public booking repository. Creation does not invoke email,
SMS or WhatsApp delivery.

The focused PostgreSQL integration test verifies claim-contact normalisation,
matching-contact ownership, rejection of a different identity, administrator
attribution, absence of sessions and notification deliveries, and complete
rollback when the audit entry cannot be written.

## UI patterns

- **Offline booking form** — custom UI pattern grouping contact, stay and stage
  fields within the existing administration layout.
- **Booking stage choice** — native browser radio buttons.
- **Booker contact and stay fields** — native text, email, telephone, date,
  number, select and textarea controls, with native required-field validation.
- **Creation hand-off** — custom success notice in the existing booking workspace.

## Verification

Production build and Astro check pass. The existing booking lifecycle suite
passes all 94 tests. Nine Playwright cases pass at 390 × 844, 768 × 1024 and
1440 × 900, covering email creation, mobile-only review, retained validation
inputs, date conflicts, sign-in requirements and cross-origin rejection.

Chrome DevTools inspected the rebuilt running application at those three
widths: no document overflow or unintended local overflow on the new form;
labelled controls, grouped fields, keyboard navigation and visible focus;
native empty-field validation, successful creation and admin continuation.
Console inspection found no errors or warnings on the form; network inspection
showed the expected local page request without background API calls.

Lighthouse initially found low contrast in the introduction. After correction,
desktop and mobile snapshot audits score accessibility 100, best practices 100
and agentic browsing 100. SEO is 80 due to the existing private admin layout’s
missing meta description; the layout deliberately uses noindex. Reports were
written to `/tmp/admin-booking-lighthouse-corrected/` and
`/tmp/admin-booking-lighthouse-mobile-corrected/`.

Checks use the existing disposable local request-journey database and preview,
with external requests disabled. No customer was contacted. Live email/SMS
delivery and actual payment processing were not exercised. Requests including
pets currently use the review route and existing occupancy editor.

Run browser coverage with:

```sh
npx playwright test --config=playwright.admin-booking.config.ts
```

Set `TEST_DATABASE_URL` or `DATABASE_URL` to a disposable local test database,
then run the focused database test with:

```sh
node --experimental-strip-types --test site/tests/integration/admin-create-booking.test.ts
```

The integration test keeps its database setup within the `site` package, using
its installed `pg` dependency. It runs from CI’s `site` working directory
without requiring root browser-test dependencies.
