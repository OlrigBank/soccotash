# Replayable live smoke tests

This suite exercises the deployed development service in a real Chromium
browser and records every run with the open-source Playwright trace viewer.
The trace contains a timeline, screenshots, DOM snapshots, network activity
and test assertions. A video is retained alongside each trace.

The default and manually triggered target is:

`https://soccotash.onrender.com`

Known Olrig Bank production hostnames are rejected by the configuration. No
production deployment or production data is in scope.

## What is tested

- the public home page and primary booking navigation;
- the principal public pages and their main headings;
- the live booking calendar loading successfully;
- interactive switching between Main House and Bespoke stay;
- interactive movement to the next calendar period;
- the PR #45 rule requiring an email address or telephone number;
- safe handling of an unknown route.

The contact-rule check deliberately sends an invalid request with no contact
method. The API rejects it before a booking record can be created.

## Replay on request

The **Live soccotash smoke test** GitHub Actions workflow can be started with
**Run workflow**. It runs Chromium on a GitHub-hosted cloud runner and uploads
`live-smoke-playback-<run number>` containing:

- `playwright-report/live-smoke/` — the browsable test report;
- `test-results/live-smoke/` — per-test trace ZIPs and videos.

Download and extract the artifact, then open the HTML report:

```bash
npm run show:live-smoke-report
```

Select a test and open its trace to replay the exact actions. An individual
trace can also be opened directly:

```bash
npx playwright show-trace path/to/trace.zip
```

## Run from a workstation

Node.js 22 or later is required.

```bash
npm ci
npx playwright install chromium
npm run test:live-smoke
```

For a visible browser run:

```bash
npm run test:live-smoke:headed
```

## Safety boundary

These recorded tests do not authenticate as an administrator, create a
booking, use a private booking link, send email or WhatsApp messages, change a
calendar, accept an offer, report a payment, or cancel anything.

Authenticated traces and private booking-page traces can contain session
cookies or bearer links. Do not add them to this recorded baseline. A future
controlled suite should create its own disposable booking and use a private,
short-retention artifact store before those journeys are automated.

An alternative non-production environment is allowed only when both variables
identify the same exact origin:

```bash
LIVE_SMOKE_BASE_URL=https://preview.example.test \
LIVE_SMOKE_APPROVED_ORIGIN=https://preview.example.test \
npm run test:live-smoke
```

Production hostnames remain blocked even when these variables are supplied.
