# E09-F02 — Harmonise Discovery and Public Content

## Status

Accepted after implementation and verification.

## Parent epic

[`E09 — Harmonise the Public UI with the Landing Page`](epics/e09-f00-harmonise-the-public-ui-with-the-landing-page.md)

## Problem

The landing page uses a centred, full-width responsive shell and one compact
header menu. Moving from it to accommodation, Local Guide, general content or
error pages introduces a persistent 260-pixel desktop sidebar and reduces the
main content width from 1,180 pixels to 888 pixels. The older boxed page headers
also make these routes feel like a separate application rather than a
continuation of the landing page.

The duplicated sidebar is no longer necessary for primary navigation because
the shared header menu and footer expose the public destinations at every
viewport. Local Guide exploration already has its own accessible tree and
category views within the page.

## Desired outcome

1. Discovery and general content continue naturally from the landing page.
2. These pages use the centred responsive shell without a competing persistent
   sidebar.
3. Page introductions have a quieter, editorial hierarchy derived from the
   landing page rather than another large elevated panel.
4. Listing comparisons, listing booking panels, Local Guide navigation and
   content meaning remain intact.
5. Booking, Booker and planning workflows remain reserved for later features.

## Scope

- Accommodation index and listing-detail routes.
- Local Guide index, categories, entries, unavailable and not-found states.
- Content-collection pages including guest information and contact.
- The public 404 page.
- A reusable `public-content-page` layout treatment.
- Public footer wording that accurately leads to availability checking without
  implying an instant booking.

## Explicit exclusions

- Changing accommodation definitions, copy, prices or availability.
- Redesigning `CompactBookingPanel` or the `/book/` workflow.
- Changing private Booker, guest or planning pages.
- Restructuring Local Guide categories or changing published entries.
- Changing canonical URLs, redirects, structured data or indexed meaning.
- Changing administration presentation.

## Implementation decision

The persistent sidebar is removed only from the in-scope discovery and content
routes by opting those pages into `showSidebar={false}`. `BaseLayout` retains
its existing sidebar capability for routes that have not yet been reviewed.
This avoids silently redesigning booking or private workflows during F02.

The shared compact header menu and footer remain the global navigation. Local
Guide hierarchy stays in the existing in-page tree and category cards, where
it is relevant to the visitor's current task.

## Acceptance criteria

1. Listings, Local Guide, general content and public error pages use the
   centred no-sidebar shell.
2. The same routes opt into one reusable `public-content-page` treatment.
3. Page headers retain one clear `h1`, readable supporting copy and appropriate
   hierarchy without the older elevated generic panel.
4. Listing grids, listing images, space cards and the listing Quick Check remain
   usable at phone, tablet and desktop widths.
5. Local Guide tree, category, entry and empty states remain navigable and
   understandable without the persistent sidebar.
6. Header and footer navigation retain all primary public destinations.
7. The footer action says **Check availability**, not **Book now**.
8. `/book/`, Booker and planning workflows do not receive the F02 content-page
   treatment.
9. Changed pages have no document-level horizontal overflow from 320 pixels
   upwards and produce no new console errors.
10. Existing metadata, Local Guide, listing, mobile-shell and booking contracts
    pass.

## Verification plan

- Run the focused E09-F02 source contract.
- Run relevant listing, Local Guide, metadata, mobile-shell and landing-page
  contracts, followed by the complete booking-lifecycle suite.
- Run `astro check` and the production build.
- Rebuild the local Docker application.
- Inspect representative listing, listing-detail, Local Guide, general content
  and error routes in Chrome at 390×844, 768×1024 and 1440×900.
- Check navigation, overflow, console output and a mobile Lighthouse audit.

## Completion evidence

- Added an optional `pageClass` contract to `BaseLayout` and introduced the
  reusable `public-content-page` treatment.
- Removed the persistent sidebar from accommodation indexes, listing details,
  Local Guide indexes/categories/entries, content-collection pages and the
  public 404 page.
- Retained the sidebar capability for unreviewed booking and private routes.
- Replaced the elevated generic content-page opening with a quieter editorial
  header, readable measure and responsive heading scale.
- Preserved listing grids, listing photography, space cards, listing Quick
  Check and the Local Guide tree and category structures.
- Changed the shared footer action from **Book now** to **Check availability**
  so it does not imply instant booking.
- Added `e09-public-content-harmonisation.test.ts` to protect route enrolment,
  the no-sidebar decision, footer wording and the booking/private exclusions.
- Eight focused listing, Local Guide, metadata, mobile-shell, sitemap and E09
  contracts passed with no failures.
- The complete booking-lifecycle contract suite passed: 82 tests, 0 failures.
- `astro check` completed with 0 errors and 0 warnings. It retained the one
  pre-existing unused-`safeReturn` hint in `admin/login.astro`.
- The production build succeeded locally and during the Docker image build.
- The rebuilt local Docker application reached its healthy state.
- Chrome DevTools inspected the accommodation index at 390×844 and 1440×900,
  the Olrig Bank listing at the same widths, Local Guide at 390×844 and
  768×1024, guest information at 1440×900 and the 404 route at 390×844.
- Every inspected route used `page-grid no-sidebar public-content-page`, had no
  persistent sidebar and had zero document-level horizontal overflow.
- Desktop discovery content uses the full 1,180-pixel shared canvas; phone
  content fits the 374-pixel inner canvas at a 390-pixel viewport.
- The listing detail and Local Guide produced no console warnings or errors.
- The Local Guide mobile Lighthouse audit scored 100 for accessibility, best
  practices, SEO and agentic browsing, with all 51 audits passing.
