# Administration guide

## Content editing

Use Pages CMS or edit the Markdown/YAML files directly.

Main areas:

- Local recommendations: `site/src/content/local-guide/`
- General pages: `site/src/content/pages/`
- Listings: `site/src/content/listings/`
- Spaces: `site/src/content/spaces/`
- Menu/category structure: `site/src/data/navigation/main.yml`
- Site/contact settings: `site/src/data/settings/`
- Booking property rules: `site/src/data/booking/properties.yml`

The `whole-property` option is a derived calendar. It uses `availabilityPropertyId: main-house`, so it follows the Main House Airbnb import and does not require another Airbnb environment variable.

## Booking operations

From the protected administration dashboard, use **Refresh Airbnb calendars** in the **Calendar status** panel. This downloads the currently configured Airbnb iCal exports, replaces the existing imported Airbnb blocks and refreshes the dashboard status when the operation succeeds.

The button uses the signed-in administrator session. `CALENDAR_SYNC_TOKEN` remains available for scheduled jobs and trusted command-line requests.

Force an Airbnb refresh locally:

```bash
npm run docker:sync
```

Review imported calendars and provisional requests locally:

```bash
npm run docker:report
```

The report contains private guest information. Do not publish it, paste it into public issues, or expose the admin token.

On Render, use the token-protected endpoints described in `docs/booking-calendar-service.md`.

## Pricing operations

Open `/admin/pricing/` to create and test versioned pricing plans. Draft plans can be edited, reordered, duplicated, simulated, and published. Published and archived plans are read-only; duplicate one to create a new editable version.

The current implementation is intentionally disconnected from the public booking quote. See `docs/pricing-foundation.md` for supported rules and calculation behaviour.

## After source or content changes

Run the local production stack:

```bash
docker compose up --build -d
```

Confirm the site and booking page, then commit and push to GitHub. Render will build the same Dockerfile.

## Defining reusable pricing rule cards

Open **Pricing**, then select **Manage rule cards**.

1. Choose the calculation behaviour, such as seasonal adjustment or fixed package.
2. Enter the card name and library description.
3. Configure its default dates, amount, percentage, nights, channel, priority and stacking behaviour as applicable.
4. Save the card.
5. Return to **Pricing**. The active custom card appears in the **Custom cards** section of the rule library.
6. Drag it into a draft plan or select **Add**, then edit that individual plan rule if required.

Archiving a card removes it from the active library. It does not remove or alter rules previously added to plans. Archived cards can be restored from the rule-card management screen.
