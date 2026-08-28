# Proposed PR #89 — Guest Planning Dashboard and Independent Plan Copies

## Status

- Parent branch: `development`
- Feature branch: `pr-89-guest-planning-dashboard`
- Intended merge target: `development`
- Current status: initial implementation complete; awaiting Booker interface review
- Database changes: required
- Primary audience: the Booker and guests who receive their own holiday-plan copy

## Objective

Turn the booking’s current Holiday Planner landing page into a planning dashboard.
The Booker can keep their original plan, duplicate it for a named guest, and copy a
private editing link to send to that guest. Each duplicate begins as a complete
snapshot of the source plan and then evolves independently through the same guest
planner interface introduced by PR #88.

The initial example is a booking belonging to Testing Bryan. Bryan duplicates his
plan for Arienne, copies Arienne’s private link, and sends it outside the
application. Arienne opens an editor that has the same List and Schedule views as
Bryan’s planner, but every change applies only to Arienne’s copy. Bryan may repeat
the operation for additional guests.

## Product model

This is a **plan family with independent forks**, not several participants editing
one shared plan.

- A confirmed booking has one original Booker plan.
- The original plan is the default duplication source.
- A guest plan records its relationship to the original booking plan and the
  guest-facing display name supplied by the Booker.
- Creating a guest plan copies the source state once. No later synchronisation,
  merging or automatic propagation occurs in either direction.
- Every guest plan has its own revision history, candidate list, days, activities,
  times, order and editing credential.
- The Booker retains dashboard access to every plan in the booking’s plan family.
- A guest credential grants access only to its one plan and reveals no booking,
  payment, contact, message or other guest-plan data.

## Existing constraints and reusable foundations

The repository currently provides one `booking_linked` plan per booking, enforced
by `holiday_plans_booking_idx`. Booker mutations are authorised by the booking ID.
The code also contains:

- transactional copying of example-plan days and items;
- booking-plan candidates and Local Guide references;
- revision-checked mutations and plan revision history;
- participant invitation tokens for collaboration on one plan;
- expiring read-only plan share links;
- the booking-linked List/Schedule planner page.

Participant invitations and read-only shares do not satisfy this feature: they
either edit/view the same plan or expire. The copying mechanics and token hashing
are useful implementation references, but independent guest copies need their own
explicit ownership and access semantics.

## Planning dashboard

The route currently presented as the Holiday Planner workspace becomes the
planning dashboard. It remains inside the Booker’s private booking area and is
available only when the booking is eligible for holiday planning.

The dashboard contains:

1. A concise heading and explanation that each guest copy becomes independent.
2. A primary card for the Booker’s original plan.
3. One card for every active guest copy, in creation order initially.
4. A **Duplicate plan for another guest** action.

Each plan card shows:

- the plan/guest name;
- `Original plan` or `Guest copy`;
- holiday dates and number of days;
- last-updated time and revision where useful;
- an **Open plan** action;
- for guest copies, a **Copy guest link** action;
- a compact action menu for rename, link replacement/revocation, duplicate and
  archive/delete operations when those operations are implemented.

The dashboard must remain useful with many guest copies. Cards wrap cleanly on
larger screens and form one vertical list on mobile. No private credential is
rendered into ordinary page text or logs beyond the one link currently being
presented to the authorised Booker.

## Creating a guest copy

Selecting **Duplicate plan for another guest** opens a compact form/dialog with:

- guest display name, required, trimmed and length-limited;
- source plan, defaulting to the Booker’s original plan;
- a clear explanation that the copy will not remain synchronised.

The initial release may fix the source to the original plan if offering arbitrary
source plans would make the interface unclear. The underlying model should retain
the source plan ID for auditability.

Creation is one transaction. It copies:

- plan title/description and booking dates;
- every plan day and its order, title and summary;
- every candidate activity and its order, source URL and Local Guide reference;
- every plan item and its day, order, type, times, status, location, source URL,
  Local Guide reference, description and visibility appropriate to this feature.

Reservation notes and other potentially booking-sensitive content require an
explicit copy rule. The safe initial rule is to omit reservation notes and any
`private` items from guest copies unless product review confirms the named guest
should receive them.

The transaction also creates a high-entropy editing token. Only its hash is stored.
The raw token is returned once to construct the guest link. Failure at any point
rolls back the plan, children, revision record and credential together.

Duplicate guest names are allowed because names are not identities, although the
dashboard should make similarly named plans distinguishable by creation/update
time. Empty or implausibly long names are rejected.

## Guest editing link and planner

The copied link opens a dedicated guest-plan route, not the Booker’s booking route.
It uses the same planner presentation and behaviours as the Booker planner:

- horizontally scrollable holiday-day tabs;
- List and Schedule views;
- Candidate activities and Local Guide in List view;
- drag, pointer and action-menu alternatives;
- activity detail editing and revision-conflict protection.

The guest page has no link into the private booking workspace. Its navigation may
identify the plan by guest display name and provide only planner-relevant actions.
Public Olrig Bank navigation remains outside this private task flow or opens in a
new page according to the existing Booker-layout convention.

The guest link remains active until the Booker revokes/replaces it, the guest plan
is archived, or the parent booking becomes ineligible under an explicit lifecycle
rule. It does not receive a short automatic expiry in the initial design.

## Booker control and lifecycle

The Booker can open and edit every guest copy from the dashboard. Booker access is
derived from the parent booking credential and plan-family relationship, never
from exposing or replaying the guest’s token.

Required credential controls:

- copy the current guest link while it is available to the Booker;
- revoke access immediately;
- replace a compromised/lost link with a new token, invalidating the old token;
- show last-accessed time without recording intrusive browsing detail.

Because raw tokens cannot be recovered from hashes, persistent “Copy guest link”
requires a deliberate design. The preferred design is a replaceable encrypted or
booking-derived capability record only if the project already has suitable secret
management. Otherwise the dashboard should clearly present a newly generated link
once and offer **Replace link** later. Plaintext tokens must not be stored in the
database merely to support repeated copying. This choice must be resolved before
implementation of the final dashboard action wording.

The Booker may permanently delete a guest copy after an explicit confirmation.
Plan-owned days, activities, candidates, revisions and credentials are removed by
database cascade. A non-secret booking activity entry records which named plan was
deleted without retaining its editing credential.

## Proposed data direction

The implementation should preserve `booking_linked` mutation and access guarantees
while allowing several plans within one booking family. The likely schema work is:

- distinguish the original booking plan from guest copies;
- add a parent/original plan reference and guest display name;
- replace the current one-plan-per-booking uniqueness rule with uniqueness for the
  single original plan while permitting multiple guest copies;
- add a hashed, revocable guest editing credential with created, last-accessed,
  revoked and replaced timestamps;
- index active plans by booking/original relationship;
- preserve referential restrictions and cascade only within an individual plan.

The exact migration should be chosen after integration tests demonstrate that
existing booking plans become originals without data loss and all existing
booker/admin access paths continue to resolve the original plan deterministically.

## Security and privacy requirements

- Guest-plan tokens use cryptographically secure random values and database hashes.
- Tokens never appear in server logs, revision JSON, analytics or error messages.
- Responses containing a private link use `Cache-Control: private, no-store` and
  private pages retain `noindex,nofollow,noarchive`.
- A guest token authorises exactly one active guest plan.
- Guest access cannot enumerate the booking, original plan or sibling guest plans.
- Booker dashboard actions require the valid parent booking credential and same-
  origin mutation protection.
- Revision conflicts remain visible and never silently overwrite another editor.
- Revoked, replaced or archived credentials fail without revealing whether a plan
  previously existed.

## Audit requirements

Record non-secret audit events for:

- guest plan created, including source and new plan public IDs plus guest name;
- guest plan renamed;
- guest link created, replaced or revoked, excluding token values;
- guest plan archived/restored if supported;
- guest plan permanently deleted, excluding token values;
- ordinary guest edits through the copied plan’s own revision history.

Booking activity should make the existence and lifecycle of guest copies visible
to administrators without exposing guest credentials.

## Accessibility and mobile requirements

- Dashboard controls have at least 44px touch targets.
- Copy-link feedback is announced through an accessible status region.
- Dialogs have labelled fields, predictable focus and keyboard cancellation.
- Plan cards remain understandable without colour or icons.
- Guest planner interaction retains all PR #88 action-menu alternatives to drag.
- The dashboard works without horizontal document scrolling at 320px width.

## Initial out of scope

- Synchronising, merging or comparing independent plans.
- Notifications or emailing links from Olrig Bank; the Booker sends links.
- Guest accounts, passwords or identity verification by email.
- Allowing a guest to see the booking, payments, messages or other plans.
- Real-time collaborative editing of one plan.
- Guests creating further guest copies.
- Converting guest copies into public example plans.
- Renaming or archiving guest copies from the dashboard in this first cut.
- Duplicating from another guest copy; the original Booker plan is the source.

## Implemented first cut

- Migration `041_guest_planning_dashboard.sql` safely classifies existing plans as
  originals and permits independently revisioned guest copies.
- The Booker planning workspace is now a dashboard listing the original and every
  guest copy, with repeatable guest creation.
- Guest creation transactionally copies days, candidates and non-private plan
  activities while omitting reservation notes.
- A one-time **Copy link (to send to guest)** button appears beside **Open plan**
  after creation and disappears once copying succeeds; only the link hash is
  stored. Replacing a link makes the one-time copy button appear again.
- On first use, the guest must choose and confirm a password. Later browser
  sessions require that password before the planner opens. Passwords use the
  existing scrypt hashing implementation and authenticated sessions are stored
  as hashes. The Booker can reset the password to empty from the guest plan menu,
  immediately invalidating existing guest sessions and returning the link to its
  first-use password setup state.
- Dedicated guest URLs reuse the complete List/Schedule planner and participant
  mutation API without exposing the booking workspace or sibling plans.
- Creation, link replacement and link revocation write non-secret booking audit
  events; plan edits retain the existing revision history.
- Guest planner pages are titled with the guest name and omit the private-booking
  header. The Booker can permanently delete a guest copy after confirmation; the
  deletion is recorded in booking activity without retaining its private link.
- Contract and booking-lifecycle regression tests cover the new route, schema and
  dashboard surface. A local database migration and network-HTTPS build have been
  exercised successfully.

## Acceptance criteria

- Existing booking-linked plans migrate safely and appear as original plans.
- The Booker’s Holiday Planner page lists the original and all active guest copies.
- The Booker can create an independent copy for a supplied guest name repeatedly.
- Each copy contains the agreed candidate, day and activity snapshot.
- Each copy receives a private editing link scoped only to that plan.
- Opening that link presents the same List/Schedule planner format as the Booker.
- A guest can edit their copy without changing the original or any sibling copy.
- The Booker can open every copy from the dashboard.
- Link revocation/replacement prevents use of the previous token.
- Guest pages expose no booking-only information or sibling-plan identifiers.
- Creation and access mutations are transactional, revision-safe and audited.
- Existing Booker original-plan, administrator, example-plan and PR #88 behaviour
  continue to pass their regression suites.

## Implementation sequence

1. Add migration and repository integration tests for plan families, copy fidelity,
   access isolation, token revocation and legacy-plan migration.
2. Implement repository operations and dedicated guest-plan access resolution.
3. Extract/reuse the planner presentation and action API so Booker and guest copies
   cannot drift into separate interfaces.
4. Replace the Holiday Planner landing content with the planning dashboard and
   transactional duplicate flow.
5. Add guest-plan route, mutation endpoint and credential lifecycle controls.
6. Exercise mobile interactions, concurrency, security boundaries and live
   migration behaviour before PR completion.
