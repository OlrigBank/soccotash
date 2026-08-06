# Local Guide Database Migration Epic

## Epic summary

Migrate the Olrig Bank Local Guide from repository-managed Markdown source files to a database-backed content domain managed through the Olrig Bank Planner administration interface.

The migration will make the Local Guide a living operational resource rather than content that can only be changed through source control and deployment.

The new system must preserve the current public Local Guide behaviour, URLs, categories, planner references, images, and existing content while adding:

- administrator-managed drafts;
- revision history;
- publication and unpublication;
- guest contribution integration;
- safe concurrent editing;
- controlled rollback and export;
- immediate publication without a code deployment.

The migration must capture every existing Markdown entry in PostgreSQL before any Local Guide consumer is switched. After reconciliation succeeds, PostgreSQL becomes the sole runtime source and the current Markdown-backed implementation is retired as soon as the database-backed public and planner paths pass acceptance.

---

## Product vision

The Local Guide should become a first-class domain within the Olrig Bank Planner ecosystem.

Administrators should be able to create, edit, preview, publish, unpublish and archive Local Guide entries through the same authenticated operational environment used to manage example holiday plans and guest-planner contributions.

Guest-created planner content may become a Local Guide candidate only after:

1. explicit guest consent;
2. administrator moderation;
3. editorial completion;
4. a separate administrator publication decision.

The long-term architecture is:

```text
Guest Holiday Planner
        ↓ explicit consent
Guide contribution candidate
        ↓ administrator moderation
Local Guide draft or suggested update
        ↓ editorial review
Published Local Guide entry
        ↓
Selectable place pool
        ↓
Reusable in example plans and guest plans
```

The Local Guide database becomes the authoritative source of published guide content.

---

## Current state

The Local Guide is currently stored as Markdown files under:

```text
site/src/content/local-guide/*.md
```

The Astro content collection defines Local Guide fields including:

- title;
- slug;
- legacy ID;
- category;
- category label;
- image;
- external link;
- recommended status;
- summary;
- legacy text;
- Markdown body.

The public Local Guide currently:

- loads entries through Astro content collections;
- statically generates entry URLs;
- renders Markdown bodies through Astro;
- combines entries with application-defined category navigation;
- exposes entries to the Holiday Planner through content identifiers;
- requires a code change and deployment for content publication.

The Holiday Planner already includes:

- Local Guide references from plan items;
- administrator moderation of guest contribution candidates;
- accepted new-entry drafts;
- suggested updates to existing guide slugs;
- revision and audit infrastructure;
- authenticated administrator workflows.

The current guest-contribution workflow deliberately stops before actual Local Guide publication.

---

## Problem statement

The current source-controlled Local Guide creates several limitations:

- administrators cannot publish or update guide content without modifying the repository;
- accepted guest contributions cannot flow naturally into live guide content;
- publication requires a build and deployment;
- content editing is separate from planner administration;
- the Local Guide cannot operate as a continuously maintained living resource;
- non-technical administrators cannot manage guide entries safely;
- the public guide and planner contribution workflow use different persistence models.

The migration must solve these limitations without introducing broken URLs, lost content, unsafe publication, or ambiguous sources of truth.

---

## Core principles

### 1. The Local Guide is a separate domain

Local Guide entries must not be stored as Holiday Plan items.

The Olrig Bank Planner administration interface may manage Local Guide content, but the underlying domains remain distinct:

```text
Holiday Plan Item
Local Guide Entry
Guide Contribution Candidate
```

Relationships should connect these entities without merging their responsibilities.

### 2. PostgreSQL becomes the sole runtime source at cutover

The current Markdown files are one-time migration input, not a runtime fallback.

The implementation must:

1. create the database foundation;
2. capture every existing entry through a deterministic, numbered data migration;
3. reconcile database content against a generated source manifest;
4. move public and planner consumers to the database;
5. retire Local Guide content-collection reads immediately after acceptance.

The original files may be retained temporarily as a clearly identified migration snapshot, but the application must not read them after cutover.

### 3. Existing public URLs must remain stable

Every current Local Guide entry URL must continue to resolve.

Slug changes must create retained aliases or redirects.

Planner references and historical revisions must not break when an entry is renamed.

### 4. Publication remains an explicit administrator decision

Creating or accepting a draft must not make it public.

The publication lifecycle must be:

```text
Draft → Published → Unpublished
   ↘ Archived
```

Guest contribution acceptance and public publication are separate decisions.

### 5. Markdown remains the initial body format

Existing Local Guide bodies should initially be stored as Markdown in PostgreSQL.

This minimises migration risk and preserves current authoring capability.

Markdown rendering must:

- reject unsafe embedded HTML;
- sanitise generated output;
- enforce supported links and media;
- use a controlled server-side rendering path.

A future rich-text editor may replace Markdown storage, but it is outside this epic unless separately approved.

### 6. Categories remain application-managed initially

The current category hierarchy should remain defined by application code during this migration.

Database entries should reference and validate existing category identifiers.

Moving category administration into the database is a separate future feature.

### 7. Images remain external to the text migration

Existing image paths should be retained as metadata.

This epic does not require an image-upload or media-library service.

A later media-management epic may replace repository/static image handling.

### 8. Every meaningful content change is auditable

The system must retain:

- actor;
- action;
- previous and resulting values where appropriate;
- affected entry;
- revision number;
- publication decision;
- timestamp;
- source, such as administrator or accepted guest contribution.

### 9. Content recovery must not depend solely on the live database

The implementation must provide a repeatable export of Local Guide content to a portable format such as Markdown or JSON.

Database backup and export together should replace Git history as the operational recovery mechanism.

---

## Proposed domain model

### LocalGuideEntry

Represents one Local Guide entry.

Suggested fields:

- internal database ID;
- public UUID;
- current slug;
- legacy content ID;
- legacy ID;
- publication status;
- optimistic lock version;
- working revision ID;
- published revision ID;
- published timestamp;
- unpublished timestamp;
- archived timestamp;
- created by;
- updated by;
- created timestamp;
- updated timestamp.

### LocalGuideRevision

Records an immutable content version or meaningful state transition.

Suggested fields:

- Local Guide entry ID;
- revision number;
- title;
- summary;
- Markdown body;
- body format;
- category ID;
- image path;
- external link;
- recommended flag;
- actor type;
- actor ID;
- source;
- action;
- summary;
- structured before/after values;
- created timestamp.

Administrators edit the working revision. Public reads use only the published revision. Editing a published entry must not change public content until an administrator explicitly republishes the selected working revision.

### LocalGuideSlugAlias

Preserves previous public slugs.

Suggested fields:

- old slug;
- Local Guide entry ID;
- replacement slug;
- created timestamp;
- created by.

### LocalGuidePublicationEvent

Records explicit publication decisions.

Suggested fields:

- Local Guide entry ID;
- action, such as publish, unpublish or archive;
- actor;
- revision number;
- notes;
- timestamp.

### GuideContributionResult

Links an accepted contribution candidate to:

- a new Local Guide draft; or
- a proposed revision to an existing Local Guide entry.

This may reuse the existing contribution moderation model where practical.

---

## Relationships

```text
local_guide_entries
        ↑
plan_items.local_guide_entry_id
        ↑
guide_contribution_candidates.resulting_entry_id
```

Plan items should reference the stable Local Guide entry identity rather than only a mutable slug.

Public URLs should use slugs, but internal relationships should use database identifiers.

---

## Content lifecycle

### Draft

- private;
- editable by authorised administrators;
- not visible in public guide pages;
- may originate from an administrator or accepted guest contribution.

### Published

- visible through the Local Guide;
- available for planner selection;
- included in category counts and featured results;
- addressable through its canonical slug.

### Unpublished

- retained in the database and revision history;
- inaccessible publicly;
- unavailable for new planner selection;
- existing historical plan references remain resolvable in authorised plan views.

### Archived

- retained permanently or according to approved retention rules;
- read-only;
- unavailable publicly and for new planner selection;
- historical relationships remain intact.

---

## Editorial workflows

### Administrator-created entry

```text
Create draft
→ edit content
→ preview
→ publish
```

### Guest contribution: new entry

```text
Guest-created plan item
→ explicit consent
→ contribution moderation
→ accepted as new-entry draft
→ administrator edits draft
→ administrator publishes
```

### Guest contribution: suggested update

```text
Guest suggestion
→ explicit consent
→ moderation
→ accepted as suggested update
→ administrator compares with current entry
→ administrator applies or rejects update
→ administrator republishes resulting revision
```

### Slug change

```text
Administrator changes canonical slug
→ old slug stored as alias
→ old URL redirects to current canonical URL
→ planner references remain unchanged
```

---

## Stage A — Baseline inventory and database foundation

### Objective

Freeze current behaviour and create the Local Guide database domain without changing runtime reads.

### Scope

- generate a machine-readable inventory of every Markdown entry, URL, slug, legacy identifier, category, image and recommendation state;
- record entry counts, category counts, featured results, fallback summaries and body hashes;
- add entry, immutable revision and slug alias tables;
- add working and published revision pointers;
- add constraints, indexes, typed contracts, validation, repository and service layers;
- support transactional revision creation, publication transitions and optimistic concurrency;
- prohibit canonical slugs and aliases from colliding case-insensitively with each other or with application-managed category route IDs;
- add database integration and current-behaviour contract tests.

### Acceptance criteria

- the inventory accounts for every source entry and identifies any invalid or ambiguous content;
- migrations run on empty and populated databases;
- a draft can be created and edited through the service layer;
- editing a published entry changes only its working revision;
- stale writes are rejected without overwriting newer content;
- every successful mutation is atomic and auditable;
- current public behaviour remains unchanged during this foundation stage.

---

## Stage B — Deterministic Markdown data migration

### Objective

Capture every existing Local Guide Markdown entry in PostgreSQL through a numbered, deterministic migration.

### Scope

Generate migration-owned data from:

```text
site/src/content/local-guide/*.md
```

The generated migration must capture:

- filename and legacy content ID;
- canonical slug and legacy ID;
- title, summary, legacy text and complete Markdown body;
- category and relevant category label;
- image path and external link;
- recommended flag;
- initial published status and published revision;
- source fingerprint for reconciliation.

The generation and verification tooling must detect duplicate slugs, category-route collisions, invalid categories, missing or suspicious image paths, malformed frontmatter and content-count differences. It must emit a human-readable and machine-readable reconciliation report.

The numbered database migration must be transactional. Production content capture must not depend on a separately remembered import command.

### Acceptance criteria

- every source entry is represented by exactly one database entry and one initial immutable revision;
- all currently public entries have a published revision;
- titles, slugs, summaries, bodies, categories and metadata match the source manifest;
- the entry count, category counts and recommended set match the baseline;
- a failed content migration rolls back completely;
- the same migration produces the same baseline dataset in every environment;
- the source files remain untouched until runtime retirement.

---

## Stage C — Database repository and example-plan place pool

### Objective

Make migrated Local Guide entries the stable pool of places available when administrators create and edit example plans.

### Scope

- provide one database repository for canonical lookup, category listing, recommended entries and planner selection;
- add `plan_items.local_guide_entry_id` as a stable relationship;
- backfill existing slug references from canonical slugs and aliases;
- report unresolved or ambiguous references before cutover;
- temporarily retain the stored slug as a migration snapshot and rollback aid;
- update new plan-item writes to use the entry ID;
- provide a title/category/recommended-status place picker for example-plan administration;
- allow only published entries to be selected for new plan items;
- preserve plan-specific title, timing, description, location and reservation notes;
- do not duplicate the complete Local Guide body into plan items.

### Acceptance criteria

- every resolvable existing planner reference has a stable entry ID;
- an administrator can select a migrated place while creating or editing an example plan;
- a slug change does not break an existing plan reference;
- unpublished entries cannot be newly selected;
- historical plan items remain readable if their entry later becomes unavailable;
- booking and planner behaviour unrelated to Local Guide selection remains unchanged.

---

## Stage D — Database-backed public Local Guide cutover

### Objective

Make PostgreSQL the sole runtime source of Local Guide content.

### Scope

Replace Astro content collection reads for Local Guide entries with database repository calls in:

- Local Guide index;
- category pages;
- entry pages;
- featured recommendation queries;
- planner Local Guide picker;
- published example-plan rendering;
- any other Local Guide consumers.

There is no runtime fallback to Markdown. Cutover is permitted only after the database content reconciles completely with the Stage A manifest.

### Route changes

The current static entry route must become server-rendered.

The route must:

- resolve canonical slugs and aliases;
- redirect aliases to the canonical slug;
- return a non-disclosing 404 for drafts, unpublished and archived entries;
- render only published content;
- use safe Markdown rendering;
- set appropriate cache headers;
- avoid exposing revision or administrator data.

### Performance

Initial correctness takes priority over advanced caching.

The implementation should nevertheless:

- index publication status, slug and category;
- avoid unnecessary repeated queries;
- define cache invalidation rules;
- make unpublication effective immediately;
- record and observe database failures safely.

### Acceptance criteria

- all published database entries render publicly;
- current slugs remain valid;
- old aliases redirect correctly;
- unpublished and archived entries return 404;
- category counts and featured entries are correct;
- new publications appear without a code deployment;
- unpublication takes effect immediately;
- planner references resolve current database metadata;
- database failures do not disclose sensitive information;
- existing non-Local-Guide content collections remain unchanged.

---

## Stage E — Planner-based Local Guide administration

### Objective

Allow authorised administrators to manage the database-backed place pool through the Olrig Bank Planner administration interface.

### Scope

Add Local Guide listing and filtering, draft creation, working-revision editing, Markdown preview, explicit publish and republish, unpublish, archive, revision history, revision comparison, rollback as a new revision, slug management, alias display, recommended status, image path and external link editing.

All validation must occur server-side. Same-origin protections must match existing admin workflows. Stale edits must present a recoverable conflict, forms must retain entered values after validation errors, publication actions must require explicit confirmation, and archived entries must be read-only.

Preview and public rendering must use the same sanitisation path. Preview must clearly show lifecycle status, working and published revision numbers, and guest-contribution provenance where applicable.

### Acceptance criteria

- an administrator can create and publish a new place without editing repository files;
- the published place appears publicly and in the example-plan place pool without deployment;
- edits to a published place remain private until explicitly republished;
- stale edits are rejected without data loss;
- unpublication is immediate and removes the place from new selection;
- archived entries remain available to history but are read-only;
- revision history shows actor-attributed changes;
- unsafe Markdown is rejected or sanitised.

---

## Stage F — Guest contribution publication integration

### Objective

Complete the existing guest contribution workflow by connecting moderated candidates to database-backed Local Guide drafts and suggested updates.

### Scope

For accepted new-entry contributions:

- create a private Local Guide draft;
- link it to the contribution candidate;
- retain the consent snapshot;
- retain attribution preference;
- require separate administrator publication.

For accepted suggested updates:

- create a proposed working revision against an existing stable entry ID;
- show current and proposed content;
- allow administrator editing;
- allow apply or reject;
- retain the moderation and editorial audit trail.

### Rules

- guest consent cannot publish content automatically;
- guest attribution must follow the recorded preference;
- the guest must not control final editorial wording;
- a withdrawn contribution cannot create a new draft;
- duplicate accepted contributions must not create duplicate drafts;
- publication must remain a separate administrator action;
- planner and contribution history must link to the resulting guide entry or revision.

### Acceptance criteria

- an accepted new-entry candidate creates one non-public draft;
- an accepted update candidate creates one reviewable proposed revision;
- publication never occurs automatically;
- administrator edits are recorded separately from guest-submitted content;
- attribution preference is preserved;
- rejected or withdrawn contributions do not alter the guide;
- resulting entries can later be selected in plans once published.

---

## Stage G — Retire the Markdown implementation and verify recovery

### Objective

Remove the legacy Local Guide content collection as soon as the database-backed public guide and place pool have passed cutover acceptance.

### Preconditions

- imported content reconciled;
- database-backed routes accepted;
- production backup verified;
- export command implemented;
- rollback procedure tested;
- planner references validated;
- aliases validated;
- database-backed place selection accepted.

### Scope

- remove Local Guide reads from Astro content collections;
- remove all Local Guide content-collection reads and static entry path generation;
- retain the original source only as a clearly labelled migration snapshot until recovery acceptance is complete;
- add database-to-Markdown or database-to-JSON export;
- update content and deployment documentation;
- define backup, restore and rollback procedures;
- update smoke and acceptance tests.

### Acceptance criteria

- no runtime Local Guide behaviour depends on Markdown source files;
- a complete export can recreate all current guide entries and metadata;
- backup and restore are tested;
- rollback documentation is complete;
- all public and planner behaviour remains intact;
- pages, spaces and accommodation listings remain source-controlled and unaffected.

---

## Markdown rendering requirements

Database Markdown must be rendered using a controlled server-side pipeline.

The renderer must:

- disable or sanitise raw HTML;
- reject scripts, event handlers and dangerous URLs;
- sanitise links;
- add safe external-link behaviour where required;
- prevent unsafe embedded content;
- preserve headings, paragraphs, lists and links;
- produce accessible HTML;
- use the same renderer for preview and public output.

Rendering tests must include malicious and malformed input.

---

## URL and identifier strategy

Each entry must have:

- permanent internal database identity;
- public UUID;
- canonical slug;
- optional legacy content ID;
- zero or more historical slug aliases.

Rules:

- internal references use database identity;
- public routes use canonical slugs;
- historical slugs redirect;
- slugs are unique case-insensitively;
- a deleted or archived entry does not free a slug for unsafe reuse without an explicit policy;
- planner references survive slug changes.

---

## Planner integration requirements

Planner Local Guide references must:

- use stable database IDs;
- render current published metadata where appropriate;
- preserve historical plan-specific text and notes;
- remain readable if an entry is unpublished;
- warn authorised users if a referenced entry is archived or missing;
- prevent selection of unpublished entries for new plan items;
- not duplicate the complete guide body into plan items.

---

## Search and category behaviour

The database repository must preserve current behaviour for:

- title ordering;
- category counts;
- category descendants;
- recommended entries;
- entry summaries;
- fallback summaries where content lacks a summary;
- public links;
- planner guide searches.

The first migration should not move category hierarchy management into PostgreSQL.

---

## Security requirements

- administrator actions require authenticated administrator access;
- planner permissions do not grant Local Guide editorial access;
- publication routes require server-side authorisation;
- hidden UI controls are not sufficient;
- mutation requests require same-origin protection;
- revision checks prevent silent overwrites;
- Markdown output is sanitised;
- private drafts are not indexed or publicly exposed;
- database errors must not reveal SQL or private content;
- audit logs must not contain authentication credentials;
- guest contribution consent cannot be altered retrospectively.

---

## Privacy and attribution

Guest contributions must retain:

- exact submitted content;
- consent wording and version;
- consent timestamp;
- attribution preference;
- submitted attribution name where permitted;
- moderation decision;
- editorial changes;
- final publication link where applicable.

Public entries must not expose:

- booking identifiers;
- planner access credentials;
- guest contact details;
- private reservation notes;
- participant data;
- internal moderation notes;
- payment information.

---

## Concurrency

Local Guide entries must use revision-based optimistic concurrency.

Every editing form or mutation must include the expected revision.

A stale mutation must:

- fail with a conflict response;
- return the current revision;
- not overwrite current data;
- allow the administrator to reload the latest entry;
- record safe diagnostics without logging full private content unnecessarily.

---

## Retention

The implementation must define retention rules for:

- archived guide entries;
- revision history;
- aliases;
- rejected contribution candidates;
- withdrawn candidates;
- unpublished drafts;
- publication events;
- deleted or replaced images;
- migration-generation and reconciliation reports.

Until a deletion policy is approved, records should be archived rather than hard deleted.

---

## Backup and recovery

The database-backed Local Guide requires:

- regular database backups;
- documented restore procedure;
- content export command;
- export verification;
- migration snapshot of the original Markdown source;
- recovery tests.

A successful export should include:

- canonical slug;
- aliases;
- title;
- summary;
- body;
- category;
- image;
- external link;
- recommended flag;
- publication status;
- revision metadata where appropriate.

---

## Observability

The application should provide safe diagnostics for:

- failed content lookups;
- missing category IDs;
- slug collisions;
- alias redirects;
- publication and unpublication;
- stale edits;
- Markdown validation failures;
- contribution-to-draft creation;
- migration reconciliation mismatches;
- database read failures.

Sensitive content and credentials must not be written to unsafe logs.

---

## Accessibility

The administration interface must support:

- keyboard navigation;
- clearly associated form labels;
- visible publication status;
- errors not communicated by colour alone;
- accessible confirmation dialogs;
- keyboard-operable revision and publication controls;
- responsive layouts without horizontal overflow;
- readable Markdown preview;
- clear stale-edit recovery.

Public Local Guide pages must retain the current accessibility baseline.

---

## Testing strategy

Every increment must:

- include automated tests consistent with existing repository standards;
- leave existing tests passing;
- include PostgreSQL integration coverage where persistence changes;
- include server-side permission tests;
- include validation and stale-write tests;
- include browser acceptance in the deployed local environment before merge;
- include migration and rollback checks where applicable.

### Foundation test themes

- schema constraints;
- revision locking;
- publication lifecycle;
- rollback on failed mutation;
- slug and alias uniqueness.

### Data migration test themes

- complete Markdown capture;
- duplicate detection;
- invalid frontmatter;
- missing category;
- deterministic migration generation;
- source fingerprint verification;
- complete transactional rollback on failure.

### Administration test themes

- create and edit draft;
- preview;
- publish and unpublish;
- archive;
- revision history;
- unsafe Markdown;
- stale edit recovery.

### Public rendering test themes

- canonical URL;
- alias redirect;
- unpublished 404;
- category count;
- recommended entries;
- safe Markdown rendering;
- immediate unpublication.

### Planner integration test themes

- guide selection;
- current metadata rendering;
- slug change;
- unpublished reference;
- archived reference;
- copied example plan.

### Contribution test themes

- accepted new-entry candidate;
- suggested update;
- separate publication decision;
- attribution;
- rejection;
- withdrawal;
- duplicate suppression.

### Recovery test themes

- full export;
- restore into an empty database;
- reconciliation against source snapshot;
- application rollback using a verified database export or restored database backup;
- proof that recovery does not depend on runtime Markdown reads.

---

## Non-goals

This epic does not include:

- moving all website pages into the database;
- moving accommodation listings into the database;
- moving space descriptions into the database;
- category hierarchy editing;
- image upload or media-library management;
- automatic AI-written guide publication;
- automatic publication after guest consent;
- guest editing of published Local Guide content;
- removal of revision history;
- direct database access by external AI systems.

---

## Suggested PR sequence

### PR 1 — [Baseline contracts, schema and immutable revisions](../local-guide-stage-1-foundation-and-baseline.md)

- source inventory and behaviour manifest;
- entry, revision and alias tables;
- working and published revision pointers;
- validation, lifecycle service and integration tests.

### PR 2 — [Deterministic content data migration](../local-guide-stage-2-deterministic-data-migration.md)

- generated numbered migration containing every existing entry;
- validation and source fingerprints;
- reconciliation report;
- transactional rollback and migration tests.

### PR 3 — [Database repository and planner stable IDs](../local-guide-stage-3-planner-place-pool.md)

- canonical database read repository;
- `plan_items.local_guide_entry_id`;
- existing-reference backfill and unresolved-reference report;
- database-backed place picker for example-plan administration;
- planner integration tests.

### PR 4 — [Database-backed public cutover](../local-guide-stage-4-public-database-cutover.md)

- dynamic entry route;
- database index and categories;
- aliases and canonical redirects;
- safe Markdown rendering;
- featured entries and all remaining consumer migrations;
- public and browser acceptance tests.

### PR 5 — [Retire Local Guide Markdown runtime reads](../local-guide-stage-5-retire-markdown-runtime.md)

- remove the Local Guide Astro collection;
- remove static entry path generation and collection-backed helpers;
- retain a clearly labelled migration snapshot where required;
- prove that no runtime Local Guide path reads Markdown.

### PR 6 — [Local Guide administration and publication lifecycle](../local-guide-stage-6-administration.md)

- list, filter, create, edit and preview;
- working revision and stale-write recovery;
- publish, republish, unpublish and archive;
- revision comparison, rollback and alias management.

### PR 7 — [Guest contribution publishing integration](../local-guide-stage-7-contribution-integration.md)

- new-entry drafts;
- suggested working revisions;
- stable result linkage and existing-candidate reconciliation;
- editorial review and publication separation.

### PR 8 — [Export, backup and recovery acceptance](../local-guide-stage-8-recovery-and-completion.md)

- export command;
- empty-database restore test;
- backup and application rollback procedures;
- final compatibility-column cleanup where safe;
- final documentation and acceptance.

The sequence may be split further if a PR becomes too broad.

---

## Completion criteria

This epic is complete when:

- all existing Local Guide content is stored in PostgreSQL;
- the database is the sole runtime source with no Markdown fallback;
- migrated published entries form the selectable place pool for example plans;
- administrators can create, edit, preview, publish, unpublish and archive entries through the Olrig Bank Planner administration interface;
- existing URLs and planner references remain valid;
- slug aliases redirect correctly;
- public pages render database-backed Markdown safely;
- guest contributions can create drafts or proposed updates after explicit consent and moderation;
- publication remains a separate administrator decision;
- no Local Guide content change requires a code deployment;
- a complete content export and restore process exists;
- legacy Markdown runtime reads have been removed;
- pages, spaces and accommodation listings remain unaffected;
- existing booking, planner and Local Guide tests pass;
- the complete migration has passed interactive acceptance testing.
