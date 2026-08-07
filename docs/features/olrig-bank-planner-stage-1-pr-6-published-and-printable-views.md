# Proposed PR — Stage 1.6: Published and printable example-plan views

## Status

- Epic: [Olrig Bank Planner](./epics/olrig-bank-planner-epic.md)
- Target branch: `development`
- Suggested feature branch: `feature/published-example-plans`
- Depends on: Stage 1.5

## Objective

Complete Stage 1 by allowing administrators to preview, publish and unpublish
stable, responsive and printable example itineraries.

## Scope

- Add an authenticated preview that uses the same presentation component as
  the eventual guest-facing page.
- Add explicit publish and unpublish actions with server-side authorization,
  validation, revision checks and audit history.
- Give each published example a stable, non-secret public slug/URL with a
  collision and rename policy.
- Render a readable day-by-day itinerary containing custom and Local
  Guide-backed items with clear separation of guide content and plan notes.
- Add print-specific styling and suppress navigation and editing controls when
  printing.
- Add example-plan discovery from the appropriate public Local Guide or site
  navigation surface, subject to product review.
- Ensure drafts, archived plans and unpublished plans are absent from normal
  public discovery and return the chosen non-disclosing response publicly.
- Define cache/revalidation behaviour so unpublishing takes effect promptly.

## Acceptance criteria

- An administrator can preview a draft without making it public.
- A valid complete plan can be published at a stable URL.
- Published plans display ordered days and items correctly at desktop and
  mobile widths.
- Guide-backed items link to public guide pages while plan-specific notes remain
  distinct.
- The printed result is readable and excludes admin/navigation controls.
- Unpublishing removes the plan from discovery and public access without
  deleting its revision history.
- Draft, archived and unpublished content cannot leak through page data,
  analytics or generated routes.
- Publishing and unpublishing create meaningful audit revisions.
- Existing Local Guide, booking and payment behaviour remains intact.

## Tests

- Publish-state transition, slug and authorization tests.
- Public route tests for published, draft, archived and unpublished plans.
- Preview/public shared-rendering regression tests.
- Local Guide reference and missing-reference rendering tests.
- Print CSS, accessibility and responsive interactive acceptance.
- Existing suites, Astro checks and production build.

## Out of scope

- Guest editing, invitations and booking-linked plans.
- Guest contribution consent.
- AI links, QR codes and proposal imports.
