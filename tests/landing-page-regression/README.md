# Public-experience browser regression

This read-only Playwright suite protects the completed public experience at the
approved 320×800, 390×844, 768×1024 and 1440×900 viewports. It checks the shared
shell, representative content and discovery routes, the transition into the
booking journey, navigation, keyboard focus, Quick Check sheets, the review
carousel, overflow and the desktop hero. Local-only Quick Check scenarios use
intercepted availability and quote responses to verify listing arrangements,
responsive state preservation, complete checked-result transfer, saved-result
expiry/storage failures, quote invalidation and continuation.
They never create booking requests or send messages.

Run against the primary local Docker site:

```bash
npm run test:public-experience-regression
```

Override the local origin when required:

```bash
PUBLIC_EXPERIENCE_REGRESSION_BASE_URL=http://127.0.0.1:8081 \
npm run test:public-experience-regression
```

The suite also permits the explicitly authorised Render development origin:

```bash
PUBLIC_EXPERIENCE_REGRESSION_BASE_URL=https://soccotash.onrender.com \
npm run test:public-experience-regression
```

All other remote origins—including production—are refused. Remote runs only
open and close Quick Check controls. The response-fixture tests in
`quick-check.spec.ts` are skipped outside localhost; locally they intercept
availability and pricing and block any attempt to create a booking request.

Use `npm run test:public-experience-regression:headed` for an interactive run
and `npm run show:public-experience-regression-report` to inspect the HTML
report. The former landing-page command remains as a compatibility alias.
