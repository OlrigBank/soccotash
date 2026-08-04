# Replayable booking regression

This controlled Playwright suite records the complete Bespoke blocked-date
negotiation journey. It creates disposable local data, signs in as a disposable
administrator, opens the requested dates, publishes and accepts an offer, then
cancels it and verifies that the original calendar blocks are authoritative
again.

The suite refuses non-local origins and requires an explicit mutation opt-in.
It must never be pointed at Render or production.

Prepare a migrated local PostgreSQL database and administrator, then run:

```bash
BOOKING_REGRESSION_ALLOW_MUTATION=yes \
DATABASE_URL=postgresql://soccotash:password@127.0.0.1:5432/soccotash \
BOOKING_REGRESSION_ADMIN_EMAIL=playwright-admin@example.test \
BOOKING_REGRESSION_ADMIN_PASSWORD=playwright-admin-password \
npm run test:booking-regression
```

Use `npm run test:booking-regression:headed` for an interactive run and
`npm run show:booking-regression-report` to replay the trace and video.
