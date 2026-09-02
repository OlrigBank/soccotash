# Landing-page browser regression

This read-only Playwright suite protects the completed responsive landing page
at the approved 390×844, 768×1024 and 1440×900 viewports. It checks navigation,
layout, Quick Check sheets, the review carousel, overflow and the desktop hero
without submitting availability or booking requests.

Run against the primary local Docker site:

```bash
npm run test:landing-page-regression
```

Override the local origin when required:

```bash
LANDING_PAGE_REGRESSION_BASE_URL=http://127.0.0.1:8081 \
npm run test:landing-page-regression
```

The suite also permits the explicitly authorised Render development origin:

```bash
LANDING_PAGE_REGRESSION_BASE_URL=https://soccotash.onrender.com \
npm run test:landing-page-regression
```

All other remote origins—including production—are refused. The suite opens and
closes Quick Check controls but never submits the form.

Use `npm run test:landing-page-regression:headed` for an interactive run and
`npm run show:landing-page-regression-report` to inspect the HTML report.
