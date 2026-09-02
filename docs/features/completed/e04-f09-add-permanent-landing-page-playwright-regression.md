# E04-F09 — Add Permanent Landing-Page Playwright Regression

## Status

Completed on `agent/landing-page-playwright-regression`.

## Parent epic

[E04 — Rapid Cleanup of the Landing Page](../epics/completed/e04-f00-rapid-cleanup-of-landing-page.md)

## Context

E04-F01 through E04-F08 established the final landing-page content hierarchy,
responsive shell, unified Quick Check, galleries, guest reviews and desktop
hero treatment. Those iterations have focused source contracts and were
reviewed interactively against the local Docker deployment, but the repository
does not yet contain a replayable browser suite dedicated to the completed
landing page.

## Objective

Add a read-only Playwright regression suite that permanently exercises the
approved landing page at phone, tablet and desktop widths. Make the suite easy
to run locally, record useful failure evidence and run in continuous
integration without requiring mutable booking fixtures.

## Scope

- Add a dedicated Playwright configuration and npm commands.
- Add landing-page browser tests for 390×844, 768×1024 and 1440×900.
- Confirm the compact header menu, absence of the persistent sidebar, section
  order and page-level overflow at every width.
- Confirm the single Quick Check instance is fixed on phones and presented in
  the shared desktop/tablet band at wider widths.
- Confirm responsive date and guest controls open, close and restore focus
  without submitting or mutating booking data.
- Confirm reviews expose one, two and three cards at the approved widths,
  advance one item by buttons and keyboard, retain position across resizing
  and expand independently.
- Confirm the approved desktop hero keeps its copy treatment in the top-left
  tree area without a full-image overlay.
- Fail on browser console errors, page errors, unexpected failed requests,
  broken images or page-level horizontal overflow.
- Add a CI workflow that installs Chromium and uploads the HTML report, traces
  and screenshots when the suite runs.

## Boundaries

- Do not make availability requests or create booking records.
- Do not replace focused source-contract or booking-lifecycle tests.
- Do not use brittle full-page pixel snapshots for dynamic content.
- Do not change the approved landing-page design unless the permanent tests
  reveal a genuine defect.
- Restrict the suite to local origins by default; it is not a production smoke
  test.

## Acceptance criteria

1. `npm run test:landing-page-regression` runs the suite against a local site.
2. Tests cover 390×844, 768×1024 and 1440×900 using named Playwright projects.
3. Layout, Quick Check, review and hero behaviours described above are
   asserted through stable DOM, accessibility and geometry checks.
4. Tests collect actionable traces and screenshots on failure.
5. The suite performs no booking or administrative mutation.
6. A dedicated GitHub Actions workflow runs the suite and uploads its report
   and test results.
7. The suite passes against the primary local Docker deployment.
8. Existing booking-lifecycle tests and Astro checks continue to pass.

## Validation

- Run the dedicated Playwright suite against local Docker.
- Run the complete booking-lifecycle suite and `npm run check`.
- Run `git diff --check`.
- Confirm the Docker container and health endpoint remain healthy.

## Validation completed

- The dedicated suite passed all 10 applicable tests across the 390×844,
  768×1024 and 1440×900 projects; the desktop-only hero assertion was
  intentionally skipped in the two narrower projects.
- The suite exercised navigation, layout, overflow, responsive Quick Check
  controls, review navigation and resizing, independent review expansion and
  the localised desktop hero treatment without submitting the form.
- Browser console errors, page errors and failed requests are captured as test
  failures, with traces and screenshots retained for failed tests.
- The complete booking-lifecycle suite passed all 76 tests.
- `npm run check` completed with no errors or warnings and one pre-existing
  unused-variable hint in `src/pages/admin/login.astro`.
- `git diff --check` completed cleanly.
