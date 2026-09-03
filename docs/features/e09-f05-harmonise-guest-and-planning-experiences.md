# E09-F05 — Harmonise Guest and Planning Experiences

## Status

Accepted on 3 September 2026 after implementation and verification.

## Parent epic

[`E09 — Harmonise the Public UI with the Landing Page`](epics/e09-f00-harmonise-the-public-ui-with-the-landing-page.md)

## Problem

The holiday-planning journey is split across several visually different
experiences. Booker planning uses the private stay shell, but guest password,
invitation, read-only sharing, print, proposal review and temporary AI pages
mix private, public and administration presentation patterns.

The differences obscure the important distinction between identity and
permission. A guest should recognise the same Olrig Bank planning service while
still understanding whether they can view, contribute, edit, review proposals
or only provide a restricted plan representation to an AI service.

The planning screens are also information-dense. Their existing controls are
capable, but hierarchy, status language and next actions do not consistently
follow the public design system or remain easy to scan on a phone.

## Desired outcome

1. Booker, guest, invited participant, shared-plan and temporary AI pages feel
   like parts of one private Olrig Bank planning experience.
2. Every page makes the visitor's role, permissions and current plan clear.
3. Planning tasks remain usable at narrow widths without hiding important
   status, privacy or conflict information.
4. Existing credentials, role boundaries, revisions, proposals,
   contributions, print content and planner mutations remain authoritative.

## Scope

- Give guest password access a customer-facing private presentation rather
  than administration form styling.
- Apply the private stay identity and shared planning hierarchy to invited
  participant, read-only share, proposal-review and temporary AI pages.
- Retain an explicit label for viewer, contributor and editor access, with a
  concise explanation of what the current role can do.
- Improve the hierarchy of plan title, dates, revision, itinerary, editing,
  sharing, contribution, activity and proposal sections.
- Make day selection, activity cards, forms, notices and collaboration controls
  consistent with the established cream-and-green public system.
- Clarify temporary credential, copy-now, expiry, revocation, conflict and
  pending-proposal states in plain British English.
- Harmonise printable itineraries while preserving their print-specific
  content and suppression rules.
- Add presentation contracts covering private-shell use, role communication,
  safe links and responsive planner structure.

## Explicit exclusions

- Changing Booker, participant, share or AI credential generation, hashing,
  expiry, session or authorisation behaviour.
- Changing viewer, contributor or editor permissions.
- Changing the planner data model, revision and conflict rules, activity
  operations, Local Guide contribution workflow or AI proposal protocol.
- Exposing private items, reservation notes, contacts, payment information,
  participants or consent data through a broader role or AI representation.
- Adding new AI providers, automatically applying AI changes or sending an
  invitation as part of browser verification.
- Redesigning administration planner pages, except where a shared component
  must remain compatible.
- Completing the final whole-journey accessibility audit assigned to E09-F06.

## Proposed experience

### Private access

- The guest password page identifies the Holiday Planner and explains whether
  the guest is choosing a password or returning to an existing plan.
- Forms use customer-facing fields, buttons, errors and focus treatment.
- The page does not reveal whether an arbitrary invalid token once existed.

### Planning workspace

- Plan title and stay dates anchor the page; role and revision appear as
  supporting status rather than competing headings.
- A short permission summary explains what the current participant can do.
- Day navigation remains horizontally scrollable within its own region where
  needed, without causing document-level overflow.
- Editing and creation controls remain close to the day or activity they affect
  and retain explicit save, remove and conflict outcomes.

### Sharing and collaboration

- Read-only pages state their boundary before the itinerary.
- Invitation and temporary AI links remain clearly described as private
  credentials and retain copy-now, expiry and revocation warnings.
- AI pages remain deliberately technical, but use the same private identity and
  separate human guidance, machine-readable resources, proposal submission and
  excluded data into a clearer sequence.
- Proposal review keeps current/outdated status, selective application and
  rejection visibly distinct.

### Print

- Printed itineraries prioritise plan identity, dates, days and activities.
- Navigation and interactive-only controls remain excluded from print.
- Existing inclusion rules for private items and reservation notes are not
  broadened.

## Acceptance criteria

1. Guest password access uses customer-facing private styles and retains
   password, confirmation, same-origin and session behaviour.
2. Participant, share, proposal-review and AI HTML pages use a coherent private
   Olrig Bank shell rather than the general public navigation shell.
3. Participant pages visibly identify the role and explain its effective
   permissions without relying on colour alone.
4. Viewer controls remain absent; contributor proposal behaviour and editor
   mutation behaviour remain unchanged.
5. Plan identity, dates, revision, selected day and save/conflict feedback have
   a clear semantic and visual hierarchy.
6. Collaboration links retain private-credential warnings, one-time display,
   expiry and revocation behaviour.
7. Read-only shares cannot expose editing controls or booking details.
8. AI collaboration retains its restricted representation, schemas, protocol,
   rate limits and authorised human review before a proposal changes a plan.
9. Proposal review clearly distinguishes current and outdated comparisons and
   retains selective acceptance and rejection behaviour.
10. Print routes retain their existing private-item and reservation-note
    inclusion contracts.
11. Changed pages have no document-level horizontal overflow from 320 px and
    retain keyboard-visible focus and adequate touch targets.
12. Private responses retain `no-store`, `noindex`, no-referrer and the existing
    credential checks.
13. Existing planner, participant, share, contribution, AI and print contracts
    pass.

## Verification plan

- Add focused E09-F05 presentation contracts before implementation.
- Run guest password, participant access, planner activity, contribution,
  sharing, print and AI proposal/capability contract suites.
- Run the complete booking lifecycle suite, Astro check and production build.
- Rebuild and run the local Docker service.
- Use Chrome DevTools with non-notifying local fixtures or representative
  presentation states; do not create a real invitation, expose a credential or
  invoke an external AI service.
- Inspect guest access, each participant role, read-only sharing, proposal
  review, AI instructions, conflict and empty states at phone, tablet and
  desktop widths.
- Check landmarks, headings, accessible names, focus, contrast, local overflow,
  document overflow, console errors and representative print output.

## Completion evidence

- The private shell now accepts an explicit home destination, accessible home
  label, area label, title and footer description. Booking pages retain their
  existing defaults while planning pages identify themselves separately.
- Guest password access uses customer-facing forms, buttons and error notices,
  while retaining password setup, confirmation, same-origin and session rules.
- Participant, read-only share, proposal-review, print and temporary AI pages
  use the private Olrig Bank shell instead of general public navigation.
- Participant pages retain role-gated controls and now explain editor,
  contributor or viewer access in text. Read-only and AI pages state their
  restricted boundaries before presenting plan content.
- Plan, activity, collaboration and technical sections use the established
  surfaces and responsive private-page hierarchy. Long technical values may
  wrap without causing document overflow.
- Print rules now remove the private header and footer and reset the private
  shell width, while retaining the existing itinerary inclusion contracts.
- All 85 booking lifecycle tests pass, including the new E09-F05 presentation
  contracts and existing participant, share, print, contribution and AI
  contracts.
- `astro check` completes with 0 errors. Two hints concern administration files
  outside E09-F05 and were left untouched.
- The production and Docker builds complete successfully and the rebuilt local
  service reports healthy.
- Chrome DevTools verified the deployed styles with non-notifying
  representative guest and participant states. At 390 px, 768 px and 1440 px
  there was no document-level horizontal overflow.
- The mobile participant presentation exposed the private-planning identity,
  role, revision, plan heading, day navigation and collaboration boundary in
  the accessibility tree, with no console warnings or errors.
- A mobile Lighthouse snapshot scored 100 for accessibility, best practices,
  SEO and agentic browsing.
