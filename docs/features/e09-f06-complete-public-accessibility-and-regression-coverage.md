# E09-F06 — Complete Public Accessibility and Regression Coverage

## Status

Accepted on 3 September 2026 after implementation and verification.

## Parent epic

[`E09 — Harmonise the Public UI with the Landing Page`](epics/e09-f00-harmonise-the-public-ui-with-the-landing-page.md)

## Problem

E09-F01 to E09-F05 established a coherent public and private customer
experience, but their browser evidence is primarily feature-specific. Permanent
Playwright coverage already exists for the landing page, booking and planner
journeys, yet it does not currently express the complete E09 contract across
general content, listings, Local Guide, booking continuation, Booker workspaces
and participant roles.

The final epic step must detect inconsistencies which only become visible when
accepted features are considered together: navigation changes, duplicated
headings, unclear focus, document overflow, inaccessible current states,
American English, unsafe private-page metadata and responsive regressions at
the boundaries between journeys.

This is a completion and hardening feature. It should correct evidenced
cross-feature defects and add proportionate permanent coverage, not initiate a
new redesign or change accepted booking and planning workflows.

## Desired outcome

1. The complete customer journey satisfies one recorded responsive,
   accessibility, terminology and privacy baseline.
2. Permanent browser tests protect representative public, booking and planning
   transitions at phone and desktop widths.
3. Existing automated suites provide a practical release gate without relying
   on screenshots alone or exposing production data.
4. E09 can close with traceable evidence for every epic acceptance criterion.

## Scope

- Audit representative routes from discovery through booking request,
  reservation management and holiday planning.
- Check the shared public and private shells, headings, landmarks, current
  navigation, primary actions, focus order, visible focus, field labels,
  validation messages, notices, dialogs and destructive controls.
- Check 320 px phone, common phone, tablet and desktop widths for document
  overflow, clipped actions, unreadable layouts and inappropriate fixed UI.
- Review E09 interface copy and feature documentation for British English and
  consistent booking, reservation, stay, Booker and guest terminology.
- Resolve cross-feature defects found by the audit where the correction does
  not alter an accepted domain rule or workflow.
- Extend the existing landing-page Playwright suite into a representative
  public-experience regression covering the shared shell, a listing, general
  content, Local Guide and entry into the booking journey.
- Extend existing booking and planner Playwright suites only where necessary to
  protect E09 transitions, current-state navigation, private identity, role
  communication and overflow.
- Ensure browser fixtures remain local, disposable, non-notifying and incapable
  of targeting a non-local host when mutations are enabled.
- Update workflow names, commands and documentation where broader coverage
  makes an existing landing-only name misleading.
- Record an epic-level verification matrix and final limitations.

## Explicit exclusions

- Redesigning accepted E09 pages without a defect demonstrated by this audit.
- Changing accommodation, availability, pricing, booking, payment,
  cancellation, messaging, planner or Local Guide business rules.
- Redesigning administration pages; administration is checked only where an
  E09 shared change could have caused a regression.
- Running mutating browser checks against production or using real customer
  contact details, booking links or planning credentials.
- Adding visual snapshot baselines that are brittle to ordinary content or
  dataset changes.
- Treating automated accessibility checks as a substitute for keyboard,
  responsive and semantic inspection.
- Broad performance optimisation unrelated to a defect found on an E09 route.

## Proposed coverage matrix

| Journey | Representative evidence | Permanent protection |
| --- | --- | --- |
| Public shell | Home, general content, listings and 404 | Header/menu/footer, landmarks, primary route and overflow |
| Discovery | Listing index, listing detail and Local Guide | Navigation context, meaningful heading and booking entry |
| Booking request | Date and guest selection through request outcome | Progress, validation, continuation and duplicate-submit protection |
| Booker area | Overview, Reservation, Messages and Holiday Planner | Private identity, current workspace and saved-link boundary |
| Guest planning | Password access and invited viewer/contributor/editor | Private identity, role explanation and permitted controls |
| Sharing and AI | Read-only itinerary, AI instructions and proposal review | Restricted-data wording, no mutation in read-only views and safe metadata |
| Print | Booker and participant itineraries | Interactive shell suppression and existing private-content contract |

## Accessibility and responsive baseline

- One useful `h1` and logical heading order on each representative state.
- Appropriate banner, navigation, main, complementary and footer landmarks.
- Every interactive control has a useful accessible name and visible keyboard
  focus.
- Current navigation, selection, status, error and destructive meaning do not
  depend on colour alone.
- Forms retain programmatic labels, instructions and associated error/status
  announcements.
- Dialogs and disclosure controls retain keyboard operation and meaningful
  names.
- Touch targets remain practical and text inputs avoid mobile zoom.
- Reduced-motion preferences suppress non-essential motion.
- No document-level horizontal overflow at 320, 390, 768 or 1440 pixels;
  deliberately wide calendars, tables or day selectors scroll only within
  their labelled region.
- Public pages remain useful without client-side JavaScript wherever their
  underlying task supports it.
- Private pages retain non-indexing, non-caching and no-referrer protections.

## Permanent browser-test principles

- Use the existing Playwright installation and configurations.
- Prefer semantic locators and outcome assertions to styling selectors.
- Assert calculated document overflow and important accessibility state at
  representative viewports.
- Avoid full-page pixel snapshots as the main acceptance mechanism.
- Capture traces, screenshots and video on failure using the existing artifact
  conventions.
- Seed only synthetic `.test` identities and disposable local records.
- Preserve the existing local-host and explicit-mutation guards.
- Separate non-mutating public checks from database-backed booking and planner
  journeys so the cheapest useful suite can run independently.

## Acceptance criteria

1. A recorded matrix maps every epic acceptance criterion to automated and/or
   Chrome verification evidence.
2. Representative public routes pass keyboard, semantic, responsive, contrast
   and console inspection at the agreed widths.
3. Booking-request browser coverage protects progress, validation,
   continuation and the transition into the private area without duplicate or
   external notification side effects.
4. Booker browser coverage protects private identity, workspace navigation,
   current state and the overview-only saved-link panel.
5. Planner browser coverage protects guest access, participant role messaging,
   permitted controls, read-only boundaries and representative print output.
6. Public and private routes have no document-level horizontal overflow at
   320, 390, 768 and 1440 pixels; any local scrolling region is intentional and
   labelled.
7. Focus, accessible names, headings, landmarks, status/error announcements and
   non-colour state indicators meet the recorded baseline.
8. E09 copy and documentation use British English and consistent customer
   terminology.
9. Private-page credential, cache, referrer, indexing and analytics boundaries
   remain covered by focused contracts.
10. Shared administration consumers retain their existing contract coverage
    and no administration redesign is introduced.
11. Lifecycle, relevant integration, public-release, Playwright, Astro and
    production-build checks pass.
12. Browser workflow and local-run documentation accurately describe the final
    commands, fixture safety and retained artifacts.
13. Any limitation which cannot safely be automated is documented with the
    corresponding manual Chrome evidence.

## Verification plan

- Run the existing landing, booking and planner Playwright suites to establish
  the baseline before changing coverage.
- Add failing tests for each confirmed E09 regression gap before correcting it.
- Run the complete 320/390/768/1440 responsive matrix on representative public
  and safely generated private states.
- Exercise keyboard navigation, menus, calendars, form validation, workspace
  transitions, participant roles, conflicts and print emulation.
- Run focused privacy and presentation contracts, the complete lifecycle suite
  and relevant database-backed integration tests.
- Run Astro check, production build, public-release verification and Docker
  health checks.
- Use Chrome DevTools for accessibility-tree, console, network, Lighthouse and
  print inspection not adequately expressed by Playwright.
- Record the final command results, browser matrix, corrections and limitations
  in this feature and the parent epic before requesting acceptance.

## Corrections made

- The review carousel's off-screen slide rail contributed its full width to the
  root document despite being visually clipped. Layout and paint containment
  now keeps that rail local to the carousel, removing document overflow at all
  tested widths without changing carousel navigation.
- The saved private booking-link guidance still referred to **chat** after the
  accepted workspace name became **Messages**. The guidance now uses the same
  terminology as the navigation.

## Permanent regression coverage

- The former landing-page suite now has a public-experience command and CI
  name. The previous command remains as a compatibility alias.
- The public suite covers the home page, listing index, listing detail, Local
  Guide, booking entry and 404 response, including one `h1`, shared landmarks,
  keyboard skip-link behaviour, current navigation and document overflow.
- A 320×800 project supplements the existing 390×844, 768×1024 and 1440×900
  projects.
- The booking regression now asserts the current request step, public-page
  overflow, private Booker identity, workspace navigation and phone overflow
  within its complete disposable Bespoke negotiation journey.
- The planner regression now asserts editor role guidance, the private planning
  shell, read-only sharing, restricted AI language and phone overflow within
  its existing disposable collaboration journey.
- A planner browser workflow now runs the existing guarded planner suite for
  development pull requests and pushes against a disposable PostgreSQL service.

## Epic acceptance evidence matrix

| Epic criterion | Evidence |
| --- | --- |
| 1. Coherent customer-facing language | Accepted E09-F01–F05 records; public and private shell contracts; Chrome route inspection |
| 2. Clear navigation and primary actions | Public Playwright route/focus checks; booking and planner journey checks at phone and desktop widths |
| 3. Discovery-to-request continuity | Public Playwright transition from Ways to stay to the three-stage booking page |
| 4. Safe Booker resumption | Booking Playwright private identity, workspace and full offer/cancellation journey |
| 5. Guest role clarity | Planner Playwright editor guidance plus F05 viewer/contributor/editor contracts |
| 6. Domain invariants | 85 lifecycle tests, booking regression, planner regression and three focused integration tests |
| 7. Privacy and authorisation | Existing access, participant, sharing, AI and indexing contracts; guarded disposable browser fixtures |
| 8. Accessibility and responsiveness | Four-width public suite; Chrome accessibility trees and overflow checks; three 100-score Lighthouse audits |
| 9. Shared administration compatibility | Complete lifecycle suite and the successful administration portion of the booking regression |
| 10. Permanent browser protection | Public-experience, booking and planner Playwright suites and CI workflows |
| 11. Accepted feature evidence | E09-F01–F05 accepted; E09-F06 completion evidence recorded here |
| 12. British English and terminology | Focused copy review and correction of the remaining Booker **chat** reference |

## Verification evidence

- Public-experience Playwright: 21 passed and 3 expected desktop-only skips
  across 320×800, 390×844, 768×1024 and 1440×900.
- Booking Playwright: 1 complete database-backed Bespoke negotiation journey
  passed using synthetic `.test` identities and cleaned local records.
- Planner Playwright: 3 database-backed journeys passed, including full Local
  Guide migration coverage and collaboration with share and AI proposal review.
- Booking lifecycle suite: 85 passed, 0 failed.
- Focused integration tests for Booker access, atomic planner revisions and
  Local Guide publication safety: 3 passed, 0 failed.
- Local public-release verification passed all required pages, canonical and
  Open Graph metadata, structured data, sitemap and robots checks; the sitemap
  contained 71 URLs.
- Astro check completed with 0 errors. Its two hints are in administration
  files outside E09 and were left unchanged.
- The production build and Docker image build completed successfully; the
  rebuilt local service reported healthy.
- Chrome verified the deployed home page at 320×800, booking at 390×844,
  listing detail at 768×1024 and home page at 1440×900. Each had one useful
  `h1` and no document-level horizontal overflow. Current navigation and the
  booking progress step were programmatically exposed.
- Chrome reported no console warnings or errors on the booking page.
- Mobile Lighthouse navigation audits for the home page, Local Guide and
  booking page each scored 100 for accessibility, best practices, SEO and
  agentic browsing, with no failed audits.

## Limitations

- Lighthouse was used on representative public routes rather than every URL;
  the four-width Playwright matrix and shared-shell contracts cover the wider
  route set.
- Raw private credentials created by the booking and planner regressions are
  deliberately cleaned and not retained for later manual inspection. Private
  route behaviour is therefore protected through those real Playwright
  journeys, focused contracts and the non-notifying Chrome presentation checks
  recorded by E09-F04 and E09-F05.
- The repository's `.env` file contains an unquoted display-name value which
  produces a shell warning when sourced directly. Required database settings
  are read before that line and all guarded suites completed, but correcting a
  developer's local secrets file is outside this feature.
