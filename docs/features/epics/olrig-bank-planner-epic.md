# Olrig Bank Planner Epic

## Epic summary

Build a native Olrig Bank holiday-planning capability within the `soccotash` application.

The planner will become the authoritative, living record of a guest's holiday plan. It will support plans created and published by Olrig Bank, collaborative plans linked to bookings, and—at a later stage—optional collaboration with an external AI chosen by the guest.

The planner must remain fully useful without AI. External AI support is an optional enhancement, not a dependency of the core planning service.

The feature will be implemented in three stages:

1. **Admin Olrig Bank Planner** — staff create, manage and publish example plans.
2. **Booking-linked Guest Holiday Planner** — Bookers and invited guests collaboratively create and maintain their own holiday plan.
3. **Bring-your-own-AI collaboration** — a guest creates a temporary, restricted AI collaboration link or QR code that allows an external AI to read a limited representation of the plan and return proposed revisions for the guest's approval.

The planner should also integrate with the existing Olrig Bank Local Guide. Guide entries can be used in plans, and guest-created content may become a candidate Local Guide contribution only after explicit guest consent and administrator review.

---

## Product vision

Olrig Bank should provide guests with a collaborative planning service that is part of their stay rather than requiring them to use a separate travel-planning application.

The service should allow Olrig Bank to publish useful example itineraries, allow guests to adapt or create their own plans, and preserve the evolving plan as a living document inside the Olrig Bank service.

The long-term architecture is:

```text
Local Guide ← reviewed guest contributions
     ↑
Example plans
     ↑
Admin Planner
     ↓
Booking-linked Guest Planner
     ↓
Restricted AI collaboration interface
     ↓
Guest-approved proposed revisions
```

The Olrig Bank service remains the source of truth at every stage.

---

## Core principles

### 1. The planner is useful without AI

Every core planning action must be available through the Olrig Bank interface.

Guests must be able to:

- create and edit plan items;
- organise activities by day and time;
- use Local Guide entries;
- add their own places and activities;
- collaborate with other participants;
- distinguish ideas from agreed or booked activities;
- review the history of changes.

AI support must not be required to create, edit, understand or share a plan.

### 2. Olrig Bank owns the living plan

The authoritative plan must be stored as structured application data, not only as a generated document or free-form block of text.

Published views, printable views, AI-readable views and collaborative interfaces must all be generated from the same authoritative plan data.

### 3. Example plans and guest plans use the same model

Plans created by administrators and plans created for guests should use the same underlying plan, day, item and place models wherever practical.

This should allow an Olrig Bank example plan to be copied into a guest's planner without conversion or duplication of unrelated content.

### 4. Local Guide content is reusable

A plan item should reference a Local Guide entry where possible instead of duplicating its description, address, links and other general information.

Plan-specific details remain on the plan item, for example:

```text
Plan item: Visit Kendal Castle
Local Guide entry: Kendal Castle
Plan-specific detail: Leave Olrig Bank at 10:00
Status: Planned
```

### 5. Guest contributions require explicit consent

Guest-created plan content must never be published automatically into the Local Guide.

A guest may explicitly offer a specific item, recommendation or correction to Olrig Bank for possible inclusion in the guide.

The contribution must then be reviewed by an administrator before publication.

### 6. External AI proposes; it does not silently control

An external AI must not receive unrestricted access to the ordinary guest planner or booking record.

The initial AI collaboration model should allow an AI to:

- read a restricted representation of the plan;
- develop proposed revisions with the guest;
- return those proposed revisions;
- leave final approval to the guest within Olrig Bank.

### 7. Security and privacy are part of the design

The planner and AI collaboration interface must not expose unrelated booking data, payment information, contact details, authentication tokens or private administrator notes.

---

## Proposed domain model

The exact schema may evolve during implementation, but the planner should be based on structured entities similar to the following:

```text
Booking
 └── HolidayPlan
      ├── PlanParticipants
      ├── PlanDays
      │    └── PlanItems
      ├── Places
      ├── LocalGuideReferences
      ├── Suggestions and decisions
      ├── Notes
      ├── Attachments
      ├── RevisionHistory
      ├── GuideContributionCandidates
      └── AIProposalImports
```

### Suggested entities

#### HolidayPlan

Represents one living plan.

Possible fields:

- id;
- title;
- description;
- plan type, such as example or booking-linked;
- booking id, nullable for example plans;
- owner or creator;
- publication status;
- visibility;
- start and end dates;
- current revision number;
- created and updated timestamps.

#### PlanDay

Represents one dated or relative section of a plan.

Possible fields:

- id;
- holiday plan id;
- date;
- title;
- summary;
- ordering value.

#### PlanItem

Represents an activity, journey, meal, reservation, free-time block or other planned event.

Possible fields:

- id;
- plan day id;
- title;
- description or notes;
- item type;
- start and end time;
- location or place reference;
- Local Guide entry reference;
- status;
- ordering value;
- reservation or booking note;
- visibility;
- created by;
- updated by;
- timestamps.

#### PlanParticipant

Links a person to a holiday plan and defines their permissions.

Possible roles:

- owner;
- editor;
- contributor;
- viewer.

#### PlanRevision

Records meaningful changes to the plan.

Possible fields:

- revision number;
- actor;
- source, such as admin, guest or external AI proposal;
- summary of changes;
- structured change record;
- timestamp.

#### GuideContributionCandidate

Represents guest content offered for possible inclusion in the Local Guide.

Possible fields:

- originating plan and item;
- content offered;
- consent statement and timestamp;
- attribution preference;
- review status;
- administrator notes;
- resulting guide entry or update reference.

#### AIProposalImport

Represents a proposed plan revision returned through the external AI collaboration interface.

Possible fields:

- originating capability link;
- source plan revision;
- submitted proposal;
- validation result;
- change comparison;
- approval status;
- approving participant;
- timestamps.

---

## Plan item lifecycle

Plan items should distinguish between an idea and a confirmed arrangement.

A suggested lifecycle is:

```text
Idea → Proposed → Agreed → Booked → Completed
                         ↘ Cancelled
```

Implementation may refine the exact transitions, but it must preserve the following distinctions:

- a suggestion is not automatically agreed;
- an agreed activity is not automatically booked;
- an AI-generated suggestion is not automatically accepted;
- only an authorised participant may mark an item as booked;
- historical status changes should be auditable.

---

# Stage 1 — Admin Olrig Bank Planner

## Objective

Provide Olrig Bank administrators with an internal planner for creating, managing and publishing example holiday plans.

This stage proves the planner data model and creates immediate value before guest collaboration is introduced.

## Primary users

- Olrig Bank administrators;
- future content editors, if a distinct role is introduced.

## Example use cases

Administrators should be able to create plans such as:

- a three-day Kendal itinerary;
- a five-day Lake District itinerary;
- a seven-day family holiday plan;
- a wet-weather plan;
- a walking-focused plan;
- a food and drink plan;
- a local-history plan;
- an accessibility-conscious plan;
- a seasonal plan;
- a plan built around a local event.

## Functional scope

### Plan management

Administrators can:

- create a new example plan;
- name and describe the plan;
- set its duration or dates;
- add, edit, remove and reorder days;
- add, edit, remove and reorder plan items;
- duplicate an existing example plan;
- archive or unpublish a plan;
- preview the guest-facing presentation;
- publish the plan.

### Local Guide integration

Administrators can:

- add a Local Guide entry to a plan;
- search or browse available Local Guide entries;
- add plan-specific timing and notes without changing the guide entry;
- create a plan item without a guide entry;
- identify plan items that might justify a future Local Guide entry.

### Revision history

The system records:

- who created or changed the plan;
- when the change occurred;
- a meaningful summary of the change;
- the current revision.

### Published views

Published example plans should have:

- a stable guest-facing page;
- a readable day-by-day itinerary;
- clear distinction between general guide content and plan-specific notes;
- a printable view;
- suitable responsive behaviour.

## Stage 1 acceptance criteria

- An administrator can create a complete multi-day example plan.
- A plan can contain both Local Guide-backed and custom plan items.
- Plan days and items can be reordered.
- An example plan can be duplicated and edited independently.
- A plan can be previewed before publication.
- A published plan is visible through a stable public or appropriately restricted page.
- Unpublishing a plan removes it from normal guest discovery without deleting its history.
- Meaningful plan changes create revision-history records.
- Existing Local Guide behaviour remains intact.
- Existing booking and payment workflows remain intact.
- New code is covered by tests consistent with the repository's existing standards.

## Stage 1 out of scope

- Guest editing;
- booking-linked planners;
- participant invitations;
- guest consent contributions;
- external AI access;
- QR codes;
- AI proposal imports.

---

# Stage 2 — Booking-linked Guest Holiday Planner

## Objective

Allow a Booker to open a collaborative Holiday Planner linked to their booking and use it with other guests.

The planner should provide a complete non-AI workflow for building and maintaining the group's holiday plan.

## Planner creation

An authorised administrator or eligible Booker should be able to create or activate a Holiday Planner for a booking.

The planner may begin as:

- an empty plan;
- a copy of an Olrig Bank example plan;
- a copy of selected days or items from an example plan.

The copied plan must become independent of the example plan. Later changes to the published example must not silently alter an existing guest plan.

## Booker capabilities

The Booker should be able to:

- open the planner from the private booking area;
- set or edit the plan title and summary;
- add and organise days;
- add Local Guide entries;
- add custom activities and places;
- add times, notes and reservation details;
- change item statuses;
- invite or authorise other participants;
- review recent changes;
- use a printable or shareable view;
- offer selected content to Olrig Bank for possible Local Guide use.

## Participant permissions

A participant model should support roles such as:

- **Owner** — controls the planner, permissions and sharing;
- **Editor** — can add and change plan content;
- **Contributor** — can propose items and comment but may have restricted editing rights;
- **Viewer** — can see the current plan without editing it.

The exact invitation method should align with the existing booking access and contact architecture.

## Collaboration behaviour

The system should support:

- identification of the person who made a change;
- safe handling of concurrent or stale edits;
- visible recent activity;
- proposal and decision workflows where appropriate;
- comments or notes if included in the selected implementation scope;
- conflict prevention or conflict reporting when two users edit the same content.

## Local Guide contribution workflow

Guest-created content must follow this process:

```text
Guest plan item
    ↓ explicit consent
Guide contribution candidate
    ↓ administrator review
Local Guide entry or suggested update
```

The guest should be offered wording similar to:

> Share this recommendation with Olrig Bank so it may help future guests.

Consent must:

- apply to a specific contribution;
- be unticked or inactive by default;
- record the consent time;
- record whether attribution is permitted;
- not grant access to the rest of the guest's plan;
- not publish content automatically.

Administrators should be able to:

- review contribution candidates;
- edit the proposed text;
- reject the contribution;
- create a new Local Guide entry;
- apply it as a suggested update to an existing entry;
- preserve an audit trail from contribution to published result.

## Stage 2 acceptance criteria

- A Holiday Planner can be created for an eligible booking.
- A Booker can start with an empty plan.
- A Booker can copy an example plan into the booking-linked planner.
- Copied plan data becomes independent of the original example plan.
- Authorised participants can add, edit, reorder and remove plan items according to their role.
- Local Guide entries can be added to the plan without duplicating their general content.
- Custom guest-created activities can coexist with Local Guide-backed items.
- The UI distinguishes ideas, proposals, agreed activities and booked activities.
- The application records who made meaningful changes.
- Unauthorised users cannot open or edit the planner.
- A guest can explicitly offer a specific contribution to the Local Guide.
- No guest contribution becomes public without administrator review.
- Consent and moderation decisions are recorded.
- Existing booking access, contact, payment, notification and cancellation behaviour remains intact.
- New code is covered by tests consistent with the repository's existing standards.

## Stage 2 out of scope

- Direct external AI access;
- capability links;
- QR codes;
- machine-readable AI plan endpoints;
- AI-submitted proposals.

---

# Stage 3 — Bring-your-own-AI collaboration

## Objective

Allow a guest to use an external AI of their choice to help develop the holiday plan while keeping Olrig Bank as the authoritative source of truth.

The guest should be able to generate a temporary AI collaboration link and a scannable QR code. The link exposes a restricted representation of the plan and instructions for the external AI.

The AI returns proposed changes. The guest reviews and approves those changes within Olrig Bank before they affect the living plan.

## Terminology

This feature should be described as a **temporary AI collaboration link**, not as direct access to the ordinary guest planning page.

A suitable product description is:

> The guest creates a temporary AI collaboration link that exposes a restricted, machine-readable view of the plan and allows the AI to return proposed revisions for the guest's approval.

## User journey

```text
Guest generates AI collaboration link
        ↓
Olrig Bank displays link and QR code
        ↓
Guest gives the link to their chosen AI
        ↓
AI reads a restricted plan representation and instructions
        ↓
Guest and AI develop proposed changes in conversation
        ↓
AI returns a proposed revision
        ↓
Olrig Bank validates and compares the proposal
        ↓
Guest accepts, edits or rejects the proposed changes
        ↓
Approved changes become a new plan revision
```

## AI collaboration page

The capability link should resolve to a purpose-built AI collaboration representation, not the ordinary interactive planner.

It should provide:

- a human-readable summary;
- a machine-readable representation of the permitted plan data;
- the plan schema or protocol version;
- explicit instructions for the AI;
- the actions the AI may propose;
- prohibited actions;
- a method or format for returning proposed revisions;
- no unrelated booking information.

## AI instructions

The collaboration page should include explicit instructions rather than relying on an AI to infer the required behaviour.

The instructions should communicate requirements such as:

```text
You are helping a guest develop an Olrig Bank holiday plan.

You may:
- propose new plan items;
- amend proposed items;
- reorder activities;
- add notes and practical considerations.

You must:
- preserve existing item identifiers;
- distinguish suggestions from confirmed bookings;
- never expose or request access credentials;
- never mark an activity as booked without explicit confirmation;
- return proposed changes using the supplied schema or submission method.

You may not:
- access payment information;
- change the accommodation booking;
- invite additional participants;
- publish content to the Olrig Bank Local Guide;
- alter participant permissions;
- access private administrator notes.
```

## Proposal-only access

The first implementation should be proposal-only.

The external AI must not be able to:

- modify the live plan directly;
- change the accommodation booking;
- change payment or contact data;
- invite or remove participants;
- consent to Local Guide publication on behalf of a guest;
- mark an activity as booked without guest approval;
- access unrelated data.

## Proposed-change review

Olrig Bank should present proposed revisions as a clear comparison.

For example:

```text
Proposed by external AI

Added
• Lake cruise, Tuesday at 11:30
• Lunch at Ambio, Tuesday at 14:00

Changed
• Kendal Castle moved from Monday to Wednesday

Removed
• No items

[Accept all] [Review individually] [Reject]
```

The guest should be able to:

- accept all valid changes;
- review changes individually;
- reject all changes;
- edit a proposed change before accepting it;
- see validation errors;
- see whether the proposal was created from an outdated plan revision.

## Capability-link security

The AI collaboration link is a temporary capability and must be treated as a security-sensitive token.

It must be:

- generated only by an authorised participant;
- limited to one Holiday Planner;
- read-only plus proposal submission;
- short-lived;
- revocable;
- protected against enumeration;
- rate-limited;
- excluded from normal analytics and unsafe logging;
- invalid after expiry or revocation;
- recorded in an audit trail.

The guest should be shown exactly what information will be shared before the link is generated.

Suggested wording:

> This link shares your itinerary dates, activities, notes and public place information. It does not share guest contact details, payment information, private booking links or administrator notes.

## QR-code behaviour

The QR code is a presentation of the temporary capability link.

The interface should also provide:

- Copy AI link;
- display or download QR code;
- view shared information;
- revoke link;
- view expiry;
- create a replacement link after revocation or expiry.

## Restricted data representation

The AI representation may include:

- plan title;
- stay dates where required for planning;
- itinerary days;
- plan item titles and descriptions;
- public place details;
- plan item status;
- non-sensitive notes;
- stable plan item identifiers;
- plan revision number.

It must exclude by default:

- booking access tokens;
- private booking URLs;
- guest email addresses;
- guest telephone numbers;
- payment history;
- payment references;
- private administrator notes;
- door or access codes;
- identity or passport details;
- Local Guide publication consent decisions;
- unrelated booking details.

## Proposed protocol shape

The exact protocol should be versioned and documented.

An illustrative representation is:

```json
{
  "format": "olrig-holiday-plan",
  "version": "1.0",
  "planId": "plan_123",
  "revision": 7,
  "trip": {
    "title": "The Johnson family stay",
    "arrival": "2026-09-12",
    "departure": "2026-09-19",
    "base": "Olrig Bank, Kendal"
  },
  "days": [
    {
      "date": "2026-09-13",
      "items": [
        {
          "id": "item_14",
          "startTime": "10:00",
          "title": "Walk to Kendal Castle",
          "status": "proposed",
          "location": "Kendal Castle",
          "notes": "Suitable for the whole group"
        }
      ]
    }
  ]
}
```

The production schema must define:

- required and optional fields;
- allowed status values;
- stable identifier rules;
- deletion semantics;
- ordering semantics;
- validation rules;
- maximum payload sizes;
- handling of unknown fields;
- protocol version compatibility.

## Safe proposal import

Olrig Bank must never blindly replace the live plan.

When a proposal is submitted, the application must:

1. validate the payload against the supported schema;
2. verify the capability token and permitted planner;
3. verify the plan identifier;
4. compare the proposal's source revision with the current revision;
5. detect stale or conflicting changes;
6. reject unauthorised fields and operations;
7. calculate additions, edits, removals and conflicts;
8. display a change preview;
9. require approval from an authorised guest;
10. record the accepted or rejected proposal in the audit history.

## Stage 3 acceptance criteria

- An authorised participant can create a temporary AI collaboration link.
- The interface provides both a normal link and a scannable QR code.
- The guest is shown the categories of information that will be shared.
- The collaboration endpoint exposes only permitted planner data.
- The endpoint includes explicit AI instructions and a versioned machine-readable representation.
- The capability expires and can be revoked.
- An expired or revoked capability cannot read the plan or submit proposals.
- The external AI can return only proposed planner changes.
- Submitted proposals are schema-validated.
- Unauthorised fields and actions are rejected.
- Proposals based on an outdated revision are detected and handled safely.
- The guest sees an additions, changes, removals and conflicts comparison.
- No proposal changes the live plan without authorised guest approval.
- Accepted changes create a new plan revision and audit record.
- Rejected proposals remain recorded without changing the plan.
- External AI access cannot change the booking, payments, contact details, participant permissions or Local Guide consent.
- Existing booking, planning and Local Guide behaviour remains intact.
- New code is covered by tests consistent with the repository's existing standards.

---

## Cross-stage technical requirements

### Access control

- Administrative planner actions require appropriate administrator permissions.
- Booking-linked plans must use the existing private booking access and authentication model where practical.
- Planner permissions must be checked server-side.
- Hidden controls in the UI are not a substitute for authorisation.

### Auditability

Meaningful actions should record:

- actor;
- action;
- affected plan and items;
- previous and resulting values where appropriate;
- source of the action;
- timestamp.

Sources may include:

- administrator;
- Booker;
- invited participant;
- accepted external AI proposal.

### Concurrency and revisions

Plans should carry a revision number or equivalent concurrency control.

The application must avoid silently overwriting more recent work when:

- two guests edit simultaneously;
- a stale form is submitted;
- an AI proposal is returned after the plan has changed;
- an administrator changes an example plan while editing continues elsewhere.

### Validation

All plan and proposal changes must be validated server-side.

Validation should cover:

- required fields;
- date and time formats;
- item status transitions;
- ordering values;
- references to bookings, plans, users and Local Guide entries;
- permissions;
- payload size and content limits;
- unsupported AI protocol versions.

### Data retention

The implementation should define retention rules for:

- archived example plans;
- plans attached to completed or cancelled bookings;
- plan revision history;
- rejected Local Guide contributions;
- expired AI capability records;
- accepted and rejected AI proposals.

### Accessibility

Planner interfaces should support:

- keyboard operation;
- clear labels;
- visible status text not dependent only on colour;
- readable responsive layouts;
- accessible reordering alternatives to drag-and-drop;
- printable output.

### Observability

The application should provide sufficient structured logging and administrative visibility to diagnose:

- planner access failures;
- permission errors;
- proposal validation failures;
- expired or revoked capability use;
- concurrency conflicts;
- contribution moderation outcomes.

Sensitive tokens and private plan content must not be placed in unsafe logs.

---

## Testing strategy

Each implementation stage should be delivered through small, independently testable iterations.

All new code must:

- include automated tests that conform to the existing repository standards;
- leave existing tests passing;
- include server-side permission and validation tests;
- include migration tests where schema changes are introduced;
- be acceptance-tested interactively in the deployed local environment before merge.

### Stage 1 test themes

- create, edit, duplicate, publish and unpublish example plans;
- reorder days and items;
- Local Guide-backed versus custom items;
- revision history;
- public and printable presentation;
- permission enforcement.

### Stage 2 test themes

- create a planner for a booking;
- copy an example plan;
- verify copied data is independent;
- owner, editor, contributor and viewer permissions;
- concurrent or stale edit handling;
- item lifecycle transitions;
- contribution consent unticked by default;
- administrator moderation;
- unauthorised planner access.

### Stage 3 test themes

- capability creation, expiry and revocation;
- QR code resolves to the same restricted capability;
- permitted and excluded data;
- proposal schema validation;
- unsupported protocol versions;
- stale revision handling;
- change comparison;
- full, partial and rejected approval paths;
- attempts to change protected booking or participant data;
- audit history for proposals and approvals.

---

## Suggested implementation sequence

The epic should be implemented as a sequence of smaller feature branches and pull requests rather than one large change.

### Architecture and delivery strategy

The first delivery should establish `HolidayPlan` as the aggregate root and use
one transactional mutation boundary for plan, day and item changes. A successful
meaningful mutation should update the plan, increment its revision and append
its revision-history record atomically. Routes should not update planner tables
directly. This makes access control, audit history and stale-write protection
foundational behaviour instead of later additions.

Administrator example plans and booking-linked guest plans should use the same
tables and domain services from the first migration. The plan type and optional
booking relationship distinguish their purpose; Stage 2 adds participant and
booking authorization rather than introducing a second planner model. Copying
an example plan should use a deep-copy service that assigns new plan, day and
item identifiers and creates an independent revision sequence.

The current Local Guide is an Astro content collection rather than a set of
database records. Planner items should therefore store a stable guide content
identifier, such as its slug, and resolve current public guide content when
rendering. Timing, status, reservation details and plan-specific notes remain on
the plan item. The implementation should define visible, non-destructive
behaviour for missing or renamed guide references and must not duplicate or
migrate Local Guide descriptions merely to support the planner.

Stable opaque plan-item identifiers and revision numbers should be introduced
in Stage 1 even though the external AI protocol is Stage 3 work. This avoids a
later identity migration and gives ordinary administrator and guest editing the
same concurrency guarantees needed by AI proposals.

Reordering must have a complete keyboard-operable alternative from its first
release. Drag-and-drop, if used, is a progressive enhancement rather than the
only mutation interface.

The six proposed Stage 1 PR briefs are:

1. [Planner schema and migrations](../olrig-bank-planner-stage-1-pr-1-schema-and-migrations.md).
2. [Admin plan and day management](../olrig-bank-planner-stage-1-pr-2-admin-plan-and-day-management.md).
3. [Admin plan-item editor and ordering](../olrig-bank-planner-stage-1-pr-3-admin-plan-items-and-ordering.md).
4. [Local Guide references in plan items](../olrig-bank-planner-stage-1-pr-4-local-guide-references.md).
5. [Example-plan duplication and revision history](../olrig-bank-planner-stage-1-pr-5-duplication-and-revisions.md).
6. [Published and printable example-plan views](../olrig-bank-planner-stage-1-pr-6-published-and-printable-views.md).

A possible breakdown is:

### Stage 1

1. Planner schema and migrations.
2. Admin plan and day management.
3. Admin plan-item editor and ordering.
4. Local Guide references in plan items.
5. Example-plan duplication and revisions.
6. Published and printable example-plan views.

### Stage 2

1. [Booking-linked planner creation](../olrig-bank-planner-stage-2-pr-1-booking-plan-creation.md).
2. [Copy example plan into guest planner](../olrig-bank-planner-stage-2-pr-2-copy-example-plan.md).
3. [Booker editing workflow](../olrig-bank-planner-stage-2-pr-3-booker-editing.md).
4. [Participant roles and permissions](../olrig-bank-planner-stage-2-pr-4-participant-roles.md).
5. [Activity history and concurrency handling](../olrig-bank-planner-stage-2-pr-5-activity-concurrency.md).
6. [Guest Local Guide contribution consent](../olrig-bank-planner-stage-2-pr-6-guide-contribution-consent.md).
7. [Administrator contribution moderation](../olrig-bank-planner-stage-2-pr-7-contribution-moderation.md).
8. Guest-facing printable and shareable views.

### Stage 3

1. Versioned restricted plan representation.
2. Capability-token model and security controls.
3. AI collaboration page and explicit instructions.
4. QR code and link-management interface.
5. Proposed-change schema and validation.
6. Diff and review interface.
7. Approval, partial approval and rejection workflow.
8. Expiry, revocation, rate limiting and audit hardening.

---

## Non-goals

This epic does not initially aim to:

- create an Olrig Bank-owned general-purpose AI assistant;
- require guests to use any particular AI provider;
- give an external AI access to the normal authenticated planner interface;
- allow an AI to change bookings or payments;
- allow automatic publication of guest content;
- replace the existing Local Guide;
- become a full travel-booking marketplace;
- make reservations with third-party providers automatically;
- store guest conversations with external AI providers.

---

## Product description

> **Olrig Bank Holiday Planner** is a collaborative living itinerary attached to a guest's stay. Olrig Bank can publish example plans, and guests can create and coordinate their holiday entirely within the Olrig Bank service. Guests may optionally create a temporary collaboration link for an AI assistant of their choice, refine the plan conversationally, and return proposed changes to Olrig Bank for review and approval. Selected guest recommendations may be offered to Olrig Bank for possible inclusion in the Local Guide, but only with explicit consent and administrator moderation.

---

## Definition of epic completion

This epic is complete when:

- Olrig Bank administrators can create and publish reusable example plans;
- eligible Bookers can open and collaboratively maintain a booking-linked Holiday Planner;
- plans can use Local Guide entries and guest-created activities;
- guest contributions can enter a consented, moderated Local Guide workflow;
- an authorised guest can create a temporary restricted link and QR code for an external AI;
- an external AI can return only proposed revisions;
- guests can review and approve those revisions before they enter the living plan;
- the planner remains useful and complete without AI;
- all stages are documented, tested and accepted without breaking existing Soccotash behaviour.
