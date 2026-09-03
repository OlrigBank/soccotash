# E09 — Harmonise the Public UI with the Landing Page

## Status

Complete. E09-F01 through E09-F06 are accepted, implemented and verified.

## Epic summary

Extend the landing page's established visual language across the complete
customer-facing Olrig Bank experience. Public content, booking, reservation
management and guest planning should feel like parts of one deliberate website
rather than separate interfaces created at different stages of the product.

The landing page is the visual reference, not a rigid page template. Each
journey should use its photography, colour, typography, spacing, surfaces,
controls and responsive principles in ways appropriate to the task. The work
may change customer workflows where the existing interaction is unclear or
fragmented, particularly the request-to-book and reservation-management
journeys.

The administration domain is not being redesigned by this epic. Where public
and administration pages use the same component or behaviour, changes must
preserve the administration use case or introduce a clear shared boundary.

## Starting point

- E04 established the approved responsive landing-page composition and its
  permanent Playwright regression coverage.
- The landing page now uses a compact header and menu, a centred responsive
  shell, a cream-and-green palette, strong property photography and consistent
  booking controls.
- Other customer-facing pages retain a mixture of older shells, persistent
  sidebars, generic panels, differing control treatments and locally defined
  responsive behaviour.
- Booking, reservation management and planning have grown through several
  functional epics. Their capabilities must be preserved, but their structure
  and progression may be reconsidered where this produces a clearer customer
  journey.
- Administration pages under `/admin/*` have their own operational purpose and
  design conventions and are not a visual target for E09.

## Problem

The landing page creates a warm, photographic and coherent first impression,
but that impression is not maintained consistently when a visitor continues
through the website. Changes in page width, navigation, visual hierarchy,
spacing, cards, forms and action placement can make subsequent pages feel like
different products.

This inconsistency is more than cosmetic. A visitor deciding how to stay,
checking dates, requesting a booking and later managing a reservation should be
able to recognise the current step, understand the next action and move back or
forward without learning a new interface on each page. Existing functionality
has priority, but preserving functionality does not require preserving every
existing screen or workflow.

Without a controlled epic boundary, a site-wide visual change could also cause
regressions in availability, quotation, provisional booking, customer access,
planning, privacy or administration components shared with public pages.

## Desired outcome

1. Every customer-facing page belongs recognisably to the same Olrig Bank
   website as the landing page.
2. Shared navigation, typography, colours, spacing, surfaces, buttons, forms,
   notices and responsive rules have deliberate and reusable conventions.
3. Visitors can move from discovery through a booking request with a clear
   sense of progress, consequence and next action.
4. Bookers and invited guests receive the same coherent experience when they
   return through private links to manage a reservation or plan a stay.
5. Existing availability, pricing, booking, messaging, reservation and planner
   rules remain authoritative even where their presentation or workflow
   changes.
6. Public accessibility, narrow-screen usability, privacy and no-JavaScript
   behaviour are maintained or improved.
7. Administration pages remain operational and are changed only when necessary
   to support safely shared functionality.

## Experience boundary

For this epic, **public UI** means customer-facing experiences rather than only
pages that are anonymously accessible. It includes:

- the landing page and general public content;
- accommodation indexes and listing details;
- Local Guide pages;
- the booking request and availability journey;
- token-protected Booker reservation-management pages;
- shared, invited and AI-assisted holiday-planning pages intended for Bookers
  or guests;
- public error, empty, validation and confirmation states; and
- the shared header, menu, footer and customer-facing components used by those
  pages.

Routes under `/admin/*` and `/api/admin/*` are outside the design scope. If an
in-scope change touches a component, service or interaction also used by the
administration domain, the feature must identify that dependency and verify
that the administration workflow does not regress.

Public APIs are in scope only where an approved customer workflow requires a
compatible request, response or validation change. This epic must not weaken
authentication, authorisation, token handling, privacy or server-side business
rules.

## Design direction

The landing page supplies the reference principles:

- use the established cream-and-green visual system and current brand;
- favour warm, property-specific photography where it helps orientation or
  choice;
- retain a compact and dependable navigation model at every supported width;
- use a centred, readable content measure and intentional responsive layouts;
- reduce unnecessary nesting, bordered panels and competing calls to action;
- make the primary action visually clear without implying instant booking or
  guaranteed availability;
- keep supporting and destructive actions distinct from the primary path;
- use plain British English and consistent customer terminology;
- express status, selection, errors and availability through more than colour;
  and
- preserve visible focus, semantic structure, adequate target sizes and useful
  behaviour without client-side JavaScript where the underlying task permits
  it.

The work is not an instruction to make every page resemble the landing page's
hero or section layout. Dense calendars, forms, timelines and planning tools
must remain suited to their purpose while sharing the same design language.

## Workflow and behaviour principles

Visual review must include the complete task, not only isolated screenshots.
Each changed journey should make clear:

- where the customer is;
- what information or decision is required now;
- what will happen after the primary action;
- whether progress has been saved;
- how to correct an error or revise an earlier choice; and
- how to leave and safely resume a private journey.

The booking and reservation workflows may be reorganised, combined or divided
where evidence from the current interface supports the change. Any such change
must preserve authoritative pricing and availability, prevent duplicate or
ambiguous submissions, retain necessary consent and contact details, and keep
the transition between public browsing and private reservation access clear.

Customer-facing terminology should be reviewed as part of each feature. Use
**booking**, **booking request**, **reservation**, **stay**, **Booker** and
**guest** consistently according to the underlying state; do not use different
words merely to vary the copy.

## Feature sequence

Each feature will be specified, implemented, deployed locally and verified as
an independent iteration. Its feature record must be accepted before work
starts on the next feature. The sequence may be refined after discoveries in an
earlier feature, but changes must be recorded in this epic.

### E09-F01 — Establish the shared public design foundation

[Feature record](../e09-f01-establish-the-shared-public-design-foundation.md)

Audit the in-scope surfaces and establish the reusable public shell, design
tokens and core presentation patterns using the landing page as the reference.
Unify the customer-facing header, menu, footer, content widths, typography,
buttons, fields, panels, notices and focus treatment without prematurely
redesigning every individual workflow.

This feature must identify shared administration dependencies before changing
them and provide representative phone, tablet and desktop verification.

### E09-F02 — Harmonise discovery and public content

[Feature record](../e09-f02-harmonise-discovery-and-public-content.md)

Apply the shared foundation to accommodation indexes, listing pages, general
content, Local Guide pages and public error states. Preserve content meaning,
URLs, search metadata and Local Guide information architecture while improving
visual hierarchy, navigation and the path towards checking or requesting a
stay.

### E09-F03 — Refine the booking-request journey

[Feature record](../e09-f03-refine-the-booking-request-journey.md)

Review and improve the journey from the landing page and listings through date
and guest selection, availability, quotation and provisional booking. The
workflow may change where this reduces repetition or ambiguity, but must retain
authoritative server-side rules, explicit outcomes and safe recovery from
validation, pricing or availability changes.

### E09-F04 — Harmonise Booker reservation management

[Feature record](../e09-f04-harmonise-booker-reservation-management.md)

Bring token-protected Booker pages into the public design system and refine the
reservation journey from returning through a private link to reviewing the
stay, completing required details, viewing messages, handling payment-related
information and entering planning tools. Privacy and workspace permissions
must remain explicit.

### E09-F05 — Harmonise guest and planning experiences

[Feature record](../e09-f05-harmonise-guest-and-planning-experiences.md)

Apply the shared language to guest, invitation, shared-plan and AI-assisted
planning pages. Retain role boundaries, contribution and proposal behaviour,
print contracts and safe link handling while making navigation and next actions
consistent with the wider customer journey.

### E09-F06 — Complete public accessibility and regression coverage

[Feature record](../e09-f06-complete-public-accessibility-and-regression-coverage.md)

Review the complete public journey across representative phone, tablet and
desktop widths. Resolve cross-feature inconsistencies and add durable browser
coverage for navigation, overflow, key booking and reservation transitions,
accessibility-critical interaction and shared-component regressions.

## Delivery process

Follow the same incremental process used by the preceding UI epic:

1. inspect the current feature in the running application at representative
   phone, tablet and desktop widths;
2. write and review a dedicated feature record containing the problem, scope,
   exclusions, acceptance criteria and verification plan;
3. implement only that accepted feature, retaining existing behaviour unless
   its workflow change is explicitly in scope;
4. run focused automated tests and the relevant wider regression suites;
5. deploy and visually exercise the real application, including important
   success, empty, error and continuation states;
6. record completion evidence, limitations and any change proposed to the
   remaining sequence; and
7. obtain acceptance before beginning the next feature.

Visual changes must be assessed in context rather than accepted solely from
component tests or static markup inspection. Changes to a workflow require
end-to-end verification of the persisted result and safe resumption, not only
confirmation that the screen renders.

## Cross-cutting requirements

- Use British English in documentation, interface copy, test descriptions and
  new identifiers where ordinary words form part of the identifier.
- Preserve canonical URLs, redirects, fragments and indexed content unless a
  feature explicitly documents an approved change.
- Do not expose customer, booking, reservation, message or planning data to an
  unauthorised user, public payload, log, analytics event or search index.
- Keep server-side availability, price calculation, booking state and role
  permissions authoritative.
- Render user-provided content safely and do not introduce unsanitised HTML.
- Do not communicate meaning through colour, position or icons alone.
- Support keyboard and touch use, visible focus, semantic landmarks, useful
  accessible names and reduced-motion preferences.
- Prevent document-level horizontal overflow from 320px upwards.
- Avoid avoidable layout shift and oversized media downloads.
- Retain useful progressive enhancement and server-rendered fallbacks where
  practical.
- Verify shared changes against both their customer-facing and administration
  consumers.
- Avoid one-off page styling when a stable shared pattern expresses the same
  purpose.

## Epic acceptance criteria

1. All in-scope customer-facing routes use a coherent visual language derived
   from the landing page while retaining layouts appropriate to their tasks.
2. Shared navigation and the principal action on each page remain clear and
   usable from 320px phone widths through desktop layouts.
3. A visitor can progress from discovery to a booking request without an
   unexplained change of interface or ambiguous booking state.
4. A Booker can safely resume and manage a reservation through a private link
   with clear status, required actions and routes into planning.
5. Invited guests and planning participants receive a coherent experience with
   their role and permitted actions made clear.
6. Existing availability, pricing, quotation, provisional-booking,
   reservation, messaging and planning invariants pass automated regression
   testing after any workflow changes.
7. Authentication, token privacy, authorisation, indexing and logging
   protections pass focused regression testing.
8. Changed pages meet the agreed accessibility and responsive requirements,
   with no document-level horizontal overflow at the tested widths.
9. Shared components used by administration pages continue to support their
   existing administration workflows.
10. Permanent browser coverage protects the agreed public shell and the most
    important customer journey transitions.
11. Every feature has an accepted record and completion evidence before the
    epic is marked complete.
12. Interface copy and documentation introduced or revised by the epic use
   British English and consistent booking terminology.

## Completion evidence

- E09-F01 through E09-F06 each have an accepted feature record with completion
  evidence and verification results.
- Public, booking and planner browser workflows are protected by Playwright
  suites and development CI workflows; Chrome DevTools and Lighthouse checks
  were used for the final representative responsive states.
- The final E09-F06 evidence matrix maps the epic criteria to automated and
  manual checks, with limitations recorded rather than hidden.

## Pull request summary

### Title

Harmonise the public UI and customer journeys with the landing page

### Summary

This epic carries the landing page's visual language through the customer-facing
Olrig Bank experience while preserving authoritative booking, reservation,
messaging and planning behaviour.

- established shared public and private design foundations, including the
  cream-and-green palette, responsive shells, typography, controls, surfaces,
  focus treatment and current navigation;
- harmonised discovery, listings, general content, Local Guide and public error
  states;
- refined the booking-request journey into a clear three-stage flow with
  explicit progress, validation and continuation;
- brought Booker reservation management into the public identity while keeping
  the private access boundary, payment, message, occupancy and cancellation
  rules intact;
- unified guest, participant, shared-plan, print, proposal-review and
  restricted AI planning experiences with visible role and permission context;
- added final responsive and accessibility hardening, including correction of
  a review-carousel document-overflow defect and consistent British English;
- expanded permanent Playwright coverage and CI workflows for public,
  booking and planner journeys; and
- added repository guidance requiring Chrome DevTools inspection and
  Lighthouse audits for future meaningful UI changes.

### Verification

- 85 booking lifecycle contract tests passed.
- Public-experience Playwright passed 21 checks across 320×800, 390×844,
  768×1024 and 1440×900.
- Booking and planner database-backed Playwright regressions passed using
  disposable synthetic fixtures.
- Booker access, planner revision and Local Guide integration tests passed.
- Public-release checks passed for required pages, metadata, structured data,
  sitemap and robots.txt.
- Astro check, production build and Docker build passed; the local service was
  healthy.
- Chrome DevTools checks found no final document overflow or console errors in
  the inspected customer journeys.
- Lighthouse mobile audits for Home, Local Guide and Booking scored 100 in all
  reported categories.

## Out of scope

- A general redesign of `/admin/*` pages or administration workflows.
- Changing accommodation definitions, occupancy rules, pricing policy or the
  source of authoritative availability.
- Replacing the booking, reservation or planning domain models solely to make
  a visual change easier.
- Weakening private-link access, administrator access or role boundaries.
- Adding a new payment provider, communication channel or third-party booking
  platform unless separately approved.
- Rewriting Local Guide content or restructuring its taxonomy solely for visual
  consistency.
- Manufacturing new property claims, reviews, availability or prices.
- Applying one identical page composition to every type of customer task.

## Decisions required during feature planning

The epic deliberately does not prescribe every screen before the current
journeys have been inspected. Each relevant feature record must resolve:

- whether the persistent content-page sidebar remains useful or is replaced by
  the landing page's compact navigation model;
- which landing-page patterns become shared components and which remain unique
  to the landing page;
- the clearest ordering and grouping of the booking-request steps;
- the vocabulary and visible state model spanning booking request,
  provisional booking and reservation;
- how private Booker and guest journeys identify the property, role and safe
  route back without resembling an administration application; and
- which workflow paths and viewport states require permanent browser coverage.
