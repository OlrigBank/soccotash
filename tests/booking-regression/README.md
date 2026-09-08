# Replayable booking regression

## Booking-page continuation

Run `npm run test:booking-request` against the rebuilt local app on port 8080
and local PostgreSQL on port 5433. It reads the local database credentials from
`.env`. This focused E11 check creates a uniquely named, far-future Bespoke
request with a fictitious telephone number, no email and no WhatsApp consent.
It verifies the saved party and pet details, skipped notifications, private-page
continuation and reload, then deletes its fixture in `finally`. It does not
change pricing plans or standard availability. Trace, video and screenshots
are disabled for this test.

## Bespoke negotiation

This controlled Playwright suite records the complete Bespoke blocked-date
negotiation journey. It creates disposable local data, signs in as a disposable
administrator, opens the requested dates, publishes and accepts a resource-backed
offer, then cancels it and verifies that the allocation is released and the
original calendar blocks are authoritative again. The administrator, pricing
plan, booking, allocation and calendar fixtures are disposable.

The suite refuses non-local origins and requires an explicit mutation opt-in.
It must never be pointed at Render or production.

Prepare a migrated local PostgreSQL database and administrator, then run:

```bash
BOOKING_REGRESSION_ALLOW_MUTATION=yes \
DATABASE_URL=postgresql://soccotash:password@127.0.0.1:5432/soccotash \
npm run test:booking-regression
```

Use `npm run test:booking-regression:headed` for an interactive run and
`npm run show:booking-regression-report` to replay the trace and video.
