# E13-F01 — Private header and navigation

## Status

Implemented on `agent/e13-f01-private-navigation` on 9 September 2026.
Accepted by the owner’s instruction to continue on 9 September 2026. Part of [E13](../epics/completed/e13-f00-redesign-private-booking-pages.md).
All three E13 features are now accepted and closed.

Implementation commit: `1300d76`. E13 was accepted and closed on 9 September 2026.

## Delivered behaviour

- Private headers show the Olrig Bank Kendal logo without adjacent Private stay
  area or Your booking text, following the owner's correction during implementation.
  The logo retains an accessible name and its existing destination.
- Public Menu opens the public header's seven destinations in the same tab.
- Booking account opens Your bookings and Log out when signed in; signed-out
  visitors see Sign in. Your bookings explicitly opens the selector even for a
  single booking. Logout retains the existing POST/session-revocation behaviour.
- Disclosures close on Escape (returning focus), outside click and focus leaving
  the navigation; opening either closes the other. Panels fit narrow viewports
  and allow local vertical scrolling on short screens.
- Skip to main content is hidden until focused and moves focus to main.
- Existing section navigation, authentication and booking workflows are retained.
  The shared private layout also supplies planner pages; hidden print headers
  remain hidden. Public page headers are unchanged.

UI patterns: **Public navigation disclosure** and **Booker account disclosure**
use native details/summary with custom styling and dismissal behaviour.
**Focus-visible skip link** uses a native anchor.

## Verification

- Production build passed. Astro check: zero errors/warnings and two existing
  administration hints.
- All 86 booking lifecycle test files passed. Updated old contracts that expected
  the removed public-site link and private-area header wording.
- All 16 account/browser tests passed at 320×800, 390×844, 768×1024 and 1440×900.
  Coverage includes real local email-code verification, persisted request creation,
  session return, single/multiple-booking selectors, logout/re-entry and denied
  cross-account access. Navigation tests cover logo-only branding, skip-link focus,
  native disclosure keyboard operation, Escape/focus return, outside click,
  mutually exclusive panels, public destinations and absence of overflow.
- Chrome DevTools inspected the rebuilt local sign-in page at those four widths,
  including open public navigation, accessible structure, keyboard skip/Escape,
  visible focus, panel bounds, console and network. No document overflow or
  console errors/warnings; document and session requests returned 200.
- Final mobile and desktop Lighthouse snapshots scored 100 in all reported
  categories with zero failed audits. Reports: `/tmp/e13-f01-logo-mobile/` and
  `/tmp/e13-f01-logo-desktop/`. These audits exclude performance.
- An earlier audit identified a mismatch in the old brand's accessible name;
  the final logo-only header has an explicit name and passes that audit.

Limitations: interactive DevTools and Lighthouse focused on the signed-out shared
layout. Signed-in booking/account success, empty-account and logout states were
verified through Playwright. The existing local SMTP sink cannot forward mail;
fixtures are disposable and no customers were contacted. No production changes,
merge or deployment were performed.
