# Production acceptance tests

This is the evolving executable acceptance suite for the live Olrig Bank
service. Its default run is deliberately read-only: it uses only `GET`
requests and does not submit forms, create bookings, send messages, change
calendars, restart services, or access provider dashboards.

## Run the baseline

Node.js 22 or later is required.

```bash
node tests/production-acceptance/run.mjs
```

To retain machine-readable evidence:

```bash
node tests/production-acceptance/run.mjs \
  --json production-acceptance-$(date +%F).json
```

The default targets are:

- production: `https://olrig-bank.com`
- development: `https://soccotash.onrender.com`

Override them through command-line arguments or the environment variables
shown by:

```bash
node tests/production-acceptance/run.mjs --help
```

## What the baseline proves

- production is served over HTTPS and resolves to the canonical host;
- `www.olrig-bank.com` redirects to the canonical host;
- the production health endpoint can reach its configured database;
- the principal public pages return HTML successfully;
- every principal public page loads the privacy-safe Umami script;
- an unknown route returns a safe 404;
- the development origin is distinct and its own health endpoint can reach
  its configured database.

The public health response proves connectivity, not database identity. The
separate Render database bindings and a controlled marker-record exercise are
still required to prove that production and development data cannot cross.

## Controlled acceptance work

The following checks must not be added to the default runner. They require a
separate, explicitly authorised procedure because they mutate live data or
need provider access:

- create, amend, accept, decline, expire, or delete a booking;
- send Booker or administrator messages and emails;
- change availability or trigger calendar synchronisation;
- inspect or restart Render services;
- create and restore a database backup;
- inspect Resend, Umami, payment, Airbnb, or Render dashboards.

Record these checks using
[`docs/acceptance/controlled-production-checklist.md`](../../docs/acceptance/controlled-production-checklist.md).

## Exit status

The runner exits with status `0` only when all enabled checks pass. A failure
returns status `1`, making the suite suitable for a manual release gate or a
future scheduled workflow. It is intentionally not scheduled yet: repeated
production probes and alert ownership need to be agreed first.
