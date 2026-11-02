# Visitor analytics

The public Olrig Bank site supports optional Umami analytics. Tracking is disabled
unless `UMAMI_WEBSITE_ID` contains a valid Umami website UUID.

## Render configuration

Create a website for `olrig-bank.com` in Umami, then set its website ID in the
Render service:

```text
UMAMI_WEBSITE_ID=<website UUID>
UMAMI_SCRIPT_URL=https://cloud.umami.is/script.js
```

The script URL defaults to Umami Cloud and can be changed for a self-hosted Umami
installation. It must use HTTPS. The application sends pageviews and events
manually; automatic tracker initialisation and automatic pageviews are disabled.
Full manual mode is supported by Umami's tracker functions, including older
self-hosted versions. Do not enable automatic collection alongside this wrapper:
it could duplicate pageviews or bypass the privacy boundary.

Sources: [tracker configuration](https://docs.umami.is/docs/tracker-configuration)
and [tracker functions](https://docs.umami.is/docs/tracker-functions).

## Privacy boundary

`site/src/lib/analytics/bootstrap.js` supplies explicit payloads for both
pageviews and custom events. No default URL, referrer or title is merged in.
Known public paths retain their pathname, without query strings or fragments.
All `/booking/manage/…` subpages use `/booking/manage` and a generic title;
`/planner/…` paths use `/planner/private`. Unrecognised paths become `/other`.
Same-origin referrers use the same path sanitiser; external referrers retain only
the origin. Private route response headers also suppress browser referrers.

Event names and property values are allowlisted. Do not add names, email
addresses, telephone numbers, booking references, access tokens, message content,
dates or prices. The administration layout does not load analytics.
When adding a new public route or workflow state, review its analytics allowlist.

## Plaque journeys

`/plaque/` is the permanent gatepost destination. Each full document load records
one pageview, including reloads; calling the readiness callback again does not
record another. A bfcache restoration does not send an extra pageview.

Visiting `/plaque/` sets a tab-scoped marker that expires after 30 minutes of
inactivity. Page loads, tracked events, pointer presses and keyboard use renew an
active marker. Subsequent pageviews and tracked events carry
`data.entry_source = plaque`. No customer identifier or persistent cookie is
introduced. If session storage is unavailable, the current plaque page can still
be tagged, but attribution cannot survive navigation.

Each marked content link sends `plaque_link_clicked`, with allowlisted
`destination` and `placement` values. Header and footer navigation remain covered
by destination pageviews and the plaque attribution marker.

Sanitised unsent payloads are queued in memory and, where available, session
storage, so a link followed before the tracker loads can retain the original
pageview and click. The queue is capped at 100 entries, expires after 30 minutes,
is restricted to the configured website ID, and is cleared when handed to the
tracker. This is best-effort browser analytics, not guaranteed delivery: blocked
scripts, storage restrictions, network failure, closing a tab or a rejected
collector request can lose hits. Tracker hand-off is not collector acknowledgement.
No retry after hand-off is attempted, avoiding duplicate counts.

### Dashboard setup and release verification

Create a report/board showing:

- **Plaque page visits:** pageviews with URL `/plaque/`; these are not physical QR scans.
- **Plaque link choices:** `plaque_link_clicked`, broken down by destination and placement.
- **Onward pages:** pageviews with `entry_source = plaque`, broken down by URL.
- **Booking funnel:** plaque pageview → `listing_viewed` →
  `compact_booking_started` → `compact_booking_result` (result `available`) →
  `booking_requested`, filtered to the plaque source. Also inspect journeys that
  go directly to `/book/` and skip a listing.
- **Guide interest:** `/local-guide/` pageviews with the plaque source.

Existing booking events also include `manage_booking_opened`, `message_sent`,
`offer_accepted`, `offer_declined`, `payment_reported` and `booking_confirmed`.
Only events emitted by the relevant workflow should be used as funnel steps;
this feature does not add tracking to every payment or planner action.

Before release, confirm runtime configuration on the intended service. After an
approved deployment, follow the real plaque URL, open a listing and the booking
page, and confirm the payloads and corresponding records in Umami. Do not submit
a real booking, contact a customer or use a private customer credential.
Keep local fixtures out of production reports. The local suite uses a reserved
example.test tracker and does not contact Umami.

A dashboard is not provisioned automatically by this repository. If request-level
counts are also needed, examine available hosting access logs separately; requests,
bots, reloads and visitors are different measures.

## Regression checks

`npm run test:plaque` builds the site and exercises the production bundle against
disposable local review data, plus an unconfigured instance for graceful fallback.
It requires the existing local PostgreSQL fixture setup and Playwright Chromium.
It never sends notifications or production analytics.
