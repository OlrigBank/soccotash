# Administration guide

## Content editing

Open `/admin/content/` and choose the required website-content section. Each button opens the corresponding section of the hosted Pages CMS application in a new browser tab. The first visit may require Pages CMS/GitHub sign-in; subsequent visits use the active Pages CMS session.

The configured repository is:

```text
https://app.pagescms.org/olrigbank/soccotash
```

Content can also be edited directly in the Markdown/YAML files.

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

## After source or content changes

Run the local production stack:

```bash
docker compose up --build -d
```

Confirm the site and booking page, then commit and push to GitHub. Render will build the same Dockerfile.
