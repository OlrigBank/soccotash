# Render October 2026 security update

## Scope and implementation

The [Render eMudhra advisory](https://render.com/docs/advisory-emudhra) and
[Node 22.23.4 release](https://nodejs.org/en/blog/release/v22.23.4) were checked
on 27 October 2026. This is a runtime and trust-store update; no UI patterns
are introduced.

- `site/Dockerfile` uses `node:22.23.4-alpine` through a shared certificates
  stage. Both build tools and the production server inherit the patched Node
  runtime and refreshed Alpine `ca-certificates` package.
- `.node-version` pins Node 22.23.4 for local development and eight CI workflows.
  The Airbnb capture workflow retains Node 24, pinned to 24.22.1.
- Compatible npm security fixes update Astro to 7.4.2 and `@astrojs/node`
  to 11.1.9, with corresponding transitive dependency fixes in the lockfile.
  Direct dependency ranges now start at these tested versions.
- No dependency supplying a separate CA bundle was identified in the npm
  lockfiles. The standalone Python requirements contain XlsxWriter and tzdata;
  no Requests, HTTPX or Certifi dependency is declared there.
- No PHP application configuration was found. `cms/Dockerfile` is empty.
- The Blueprints describe `olrigbankweb` (production) and `soccotash`
  (development), both Docker services with automatic deployment disabled.
  Account inventory is confirmed below; running versions still require verification.

Updating npm dependencies or setting Render's `NODE_VERSION` alone would not
update this Docker runtime. Exact Node pins need regular security maintenance;
keep `.node-version` and the Dockerfile aligned when upgrading.

## Local validation

All database checks use a
separate disposable PostgreSQL container on loopback port 55439; no customer
credentials or notifications are used. Existing application containers are
left running. The three disposable verification containers were removed after
checks; the final image is retained locally.

Validation completed and repeated after the dependency fixes on branch
`security/render-october-2026`:

- Fresh Docker build with `--pull --no-cache`: passed. Astro checked 411 files
  with zero errors, zero warnings and three existing hints; production build
  passed. Base image digest:
  `sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914`.
- Final image ID: `sha256:0d0134e72860036be7f69ee258d725f3589c6121923b3102e409dcb74865b2db`.
  Retained locally as `soccotash-security:2026-10-27-final`.
- Final image: Node `v22.23.4`, Alpine `ca-certificates` `20261020-r0`.
  Node `fetch` accepted `https://nodejs.org/` (HTTP 307) and rejected both
  compromised test endpoints with `CERT_REVOKED`.
- Patched Node unit/regression suites: booking lifecycle 292/292,
  reservation export 12/12, pricing history 15/15. PostgreSQL integration
  suite: 53/53, no skipped tests.
- Playwright: 6/6 payment-layout tests passed at 390×844, 768×1024 and
  1440×900 against image-built assets served by Node 22.23.4. Coverage includes
  keyboard method switching, focus and validation, reload continuation,
  pending/review, offer, confirmed, cancelled, payment-reported and balance states.
- Chrome DevTools: inspected rebuilt `/book/` and the non-notifying payment
  harness at the same three viewports. No document or unintended local
  overflow, no console warnings/errors. Accessible headings, landmarks and
  control names inspected; empty-date validation and payment-method navigation
  worked. Keyboard skip link had a visible 3px outline. Booking and session
  requests returned HTTP 200; payment documents returned HTTP 200.
- Lighthouse mobile booking navigation: accessibility 96, best practices 100,
  SEO 100, agentic browsing 100. One existing footer paragraph contrast failure
  (2.4:1) comes from unchanged BaseLayout/global styles and is outside this
  runtime patch. Payment bank-transfer snapshot: all four categories 100,
  no failed audits. These audits exclude performance. Reports are in
  `/tmp/soccotash-security-lighthouse-final/` and
  `/tmp/soccotash-security-payment-lighthouse-final/`.
- Initial Playwright attempts failed because sandbox localhost access was
  restricted and its default web-server command rebuilt shared generated assets.
  The successful run used an explicit fixture-only configuration without a
  rebuild, against restored image-built assets and the patched-Node harness.
- Running image health: HTTP 200, `{"status":"ok","database":"ok"}`.
- `git diff --check`: passed. No application UI source was changed.

Outstanding limitations:

- Initial `npm ci` reported 14 dependency vulnerabilities (1 moderate, 12 high,
  1 critical). A separate audit was initially rejected by automatic review
  because it sends dependency metadata to npm. The user then explicitly
  authorised the audit. Compatible `npm audit fix --package-lock-only --ignore-scripts` resolved all reported findings without `--force` or direct
  major upgrades. Full application audit (including development dependencies) and root test-tool
  audit both reported zero findings. This is
  point-in-time advisory coverage, not a guarantee against undisclosed issues.
- Live service inventory and deployment records were inspected read-only in the
  user-confirmed workspace `tea-cvk0p7i4d50c73di1140` (“My Workspace”). The API
  returned two services including previews, and no workers, cron jobs or static
  sites. Both use Docker, `rootDir: site`, `./Dockerfile`, manual deployment,
  Frankfurt, one starter instance and `/api/health/`.
  - Production `olrigbankweb`, branch `main`, ID `srv-d9j556favr4c73bst8sg`:
    live deploy `dep-dbc9pjo473hc73fiidtg`, completed 21 October 2026 at
    11:08 UTC, commit `cf05f3c191711696de3c413c7f3c422aa37e570b`.
  - Development `soccotash`, branch `development`, ID
    `srv-d9bo2ojbc2fs73eh982g`: live deploy `dep-dbb6sg2jnfac73f70ch0`,
    completed 19 October 2026 at 19:25 UTC, commit
    `14dd5719cea8748efc51baee591e3099c0b1b027`.
  Deployment dates and Docker tags do not prove installed patch versions.
  Running Node/CA versions and trust overrides still require service-shell
  verification. Both services need a verified patched rebuild and deployment.
- Real payment, email, SMS, WhatsApp and calendar providers were not exercised.
  Fixture tests prevent notifications; certificate tests send no credentials.
- Nothing has been merged, pushed or deployed. This branch is based on the
  current local `development` commit `e10f9f4`; production currently runs an older
  commit. Review the complete development-to-production diff before a production
  merge so that unrelated application changes are not released inadvertently.

## Deployment checklist — approval required

1. Confirm the intended Render workspace and inventory every web service,
   worker, cron job, preview and legacy static-site build. Compare its deployed
   commit and runtime with the repository; do not assume Blueprint names are
   a complete account inventory.
2. After approval, deploy the reviewed commit to development with a fresh build
   and cleared build cache. Confirm the build resolves the patched Node image
   and a distribution-patched certificate package. Updating an image tag without
   rebuilding and replacing running containers is insufficient.
3. Check `/api/health/`, database access, calendar imports and booking/payment
   workflows using non-notifying fixtures. Record deploy ID, commit, Node
   version, Alpine package version and image digest.
4. In the running service shell, run `node --version` and
   `apk info -v ca-certificates`. Using Node's `fetch` (the application's HTTP
   client), request a known valid HTTPS destination and both endpoints below.
   Valid HTTPS must work. Each compromised endpoint must fail specifically with
   a certificate verification error; DNS errors, timeouts or blocked egress
   are inconclusive. Any HTTP response from either compromised endpoint fails
   the security check, regardless of status:
   - `https://dv-g3b-emudhra.we-have-a-problem.com/`
   - `https://dv-g3b-aaa-emudhra.we-have-a-problem.com/`
5. After approval, repeat for production and every other affected service.
   Check logs and health after replacement. Do not use customer notifications
   as a smoke test. Retain a tested patched image for rollback: an older
   vulnerable image would reintroduce the issue.

Example request in the service shell (no credentials needed):

```sh
node --input-type=module -e 'try { const r = await fetch("https://dv-g3b-emudhra.we-have-a-problem.com/", {signal: AbortSignal.timeout(15000), redirect: "manual"}); console.log("FAIL: accepted certificate", r.status); process.exitCode = 1; } catch (e) { console.log(e.cause?.code || e.name); }'
```

Inspect the reported error; this diagnostic deliberately does not treat every
network failure as proof of certificate rejection. Repeat for the second
endpoint and a valid HTTPS control. Local image checks cannot replace these
checks from the deployed services, which may have different trust overrides.

## Separate TLS follow-up

Several PostgreSQL connections, including `site/scripts/migrate.mjs`, use
`rejectUnauthorized: false`. Review internal versus external database routes
and Render's supported CA chain before introducing certificate verification.
This update does not change that configuration. Do not enable verification
blindly and risk breaking database access or migrations.
