# Proposed PR #92 — Mobile Local Guide Editorial Workspace

## Status

- Parent branch: `development`
- Feature branch: `agent/local-guide-mobile-editor`
- Intended merge target: `development`
- Current status: implementation and local interactive review complete; ready to merge
- Database changes: required
- Primary audience: Olrig Bank administrators maintaining the Local Guide

## Objective

Provide one mobile-capable administration workspace in which the complete Local
Guide can be maintained as a draft and published atomically. Administrators can
edit entries, maintain the category tree, review guest contributions and check
external URLs without exposing partially completed editorial work publicly.

## Agreed product model

The Local Guide has two complete views:

1. **Published guide** — the coherent tree and entry revisions currently used by
   public pages and holiday planners.
2. **Working draft** — all saved entry, category, ordering and moderation changes
   that have not yet been published.

Saving a change updates only the working draft. **Publish Local Guide** promotes
the complete valid draft in one database transaction. Visitors must see either
the previous publication or the new publication, never a mixture produced by a
partially completed publish.

Publishing must not be automatic when an entry is edited or a contribution is
accepted. Administrators may save and leave the draft at any point, return later
and publish when ready.

## Existing foundation

The database already provides Local Guide entries, immutable entry revisions,
working and published revision pointers, slug aliases, optimistic locking,
publication state, audit events and contribution moderation. PR #92 should
preserve those guarantees.

The current category hierarchy is static application configuration. Supporting
renaming, moving, ordering and deletion therefore requires database-backed
category and publication state. Runtime Local Guide consumers must stop treating
the static category array as the authoritative tree after migration.

## Editorial workspace

The main administration page presents the working draft as its category tree.
Each category and entry is a selectable row with a compact status indication and
an overflow action menu. Published-versus-draft changes should be recognisable
without filling the mobile screen with permanent buttons.

Selecting an entry opens an editor above the workspace:

- desktop and wider displays: floating side panel;
- mobile: full-screen sheet/dialog;
- a persistent header provides entry title, Save and Close;
- closing with unsaved changes requires confirmation;
- browser history/back should close the editor before leaving the workspace;
- focus is trapped while open and restored to the selected leaf when closed;
- controls and grab targets meet touch-size and keyboard accessibility needs.

Entry fields include title, slug, summary, body, category, recommended status,
website URL and image URL. Revision history and restore actions remain available
but may be a secondary view within the editor.

The website URL field includes an **Open website** action that opens the current
destination in a new browser tab. This lets the administrator inspect the source
site and locate a suitable externally hosted image without losing unsaved editor
work.

Optimistic locking remains mandatory. A stale save is rejected with a clear
reload-and-review message and must never overwrite another administrator's work.

## Category and tree maintenance

Database-backed categories require stable identifiers independent of their
editable names. The working draft records at least:

- stable category identifier;
- label and optional description;
- parent category or root placement;
- sibling position;
- working/published visibility or equivalent publication version;
- audit and concurrency metadata.

Administrators can:

- rename a category;
- move it to another valid parent;
- reorder it among siblings;
- create a category or subcategory;
- delete it only when it has no draft entries and no draft child categories.

The repository must reject cycles, moving a category below itself, invalid root
operations and conflicting sibling positions. Entry moves and category moves are
draft changes. Archived entries do not count as visible leaves, but retained
historical references must not be physically destroyed.

Entries are archived rather than hard-deleted. Existing holiday-plan references
remain stable even if an entry is no longer published.

Touch interaction may support drag and drop where reliable, but every tree move
must also have an action-menu alternative that selects destination and position.
Mobile maintenance must never depend exclusively on drag and drop.

## Contribution candidates

Pending rows from `guide_contribution_candidates` are available from the same
workspace with a visible pending count. Selecting a candidate opens the entry
editor pre-populated from its retained title, description, URL and provenance.

The administrator may:

- reject the candidate with a moderation note;
- promote it to a new draft entry;
- apply it as a suggested draft revision to an existing entry.

Promotion never publishes directly. Existing consent, attribution, provenance
and moderation evidence is retained. The promoted draft remains editable before
the whole Local Guide is published.

## External image and website URLs

For every newly created or changed entry, the image is an absolute HTTPS URL to
an image hosted outside the repository. PR #92 does not download, proxy or store
the image file. Existing repository image paths remain readable for unchanged
legacy publications, but editing such an entry requires supplying a valid
external image URL before the draft can be published.

The editor provides an immediate image preview and an Open URL action. URL syntax
is validated without allowing the application server to fetch arbitrary private
network addresses.

### Whole-guide URL check

The workspace provides a deliberate **Check all Local Guide URLs** action. It
checks the current working draft's external website URLs and image URLs through
the Local Guide validation service.

The check must:

- be started explicitly by an administrator;
- show progress and a final checked/passed/warning summary;
- use bounded concurrency, connection/read timeouts and a restricted redirect
  count;
- permit only public `http`/`https` destinations for website URLs and public
  `https` destinations for image URLs;
- reject loopback, link-local, private-network and other unsafe resolved targets
  to prevent server-side request forgery;
- treat a successful image response as credible only when its response is an
  image content type;
- record check timestamp, result class and a non-sensitive failure summary;
- avoid storing response bodies, credentials or arbitrary remote content.

A failed, timed-out or inconclusive check displays a warning icon on the affected
entry leaf. Opening the warning shows which URL failed, when it was checked and a
short reason. The check does not alter, hide or delete the entry. The
administrator decides how to correct it.

Warnings are informational during ordinary drafting. Publication presents a
summary of unresolved warnings and requires explicit administrator confirmation;
it does not become impossible merely because a remote host blocks automated
checks while the administrator has verified the URL manually.

Changing a URL makes its previous check result stale and returns the leaf to an
unchecked state until the next check. Published pages do not perform remote URL
checks during requests.

## Atomic publication

Before publication the server validates the complete draft:

- category graph is acyclic and connected to permitted roots;
- every visible entry belongs to a visible category;
- identifiers, slugs and aliases remain unique;
- required content is present;
- every new or changed entry has an absolute HTTPS image URL;
- contribution decisions and entry revision pointers are consistent;
- the administrator has acknowledged any current URL warnings.

Publication creates a durable publication record identifying the administrator,
timestamp and exact category/entry revision set. Public readers resolve one
publication snapshot. Publishing is idempotent and protected by a workspace
version so two administrators cannot silently publish conflicting drafts.

The previous publication remains auditable and recoverable. A rollback creates a
new publication pointing to the selected prior snapshot; history is not mutated.

## Mobile requirements

- core operations fit a narrow portrait viewport without horizontal page scroll;
- the tree remains readable with indentation capped at a practical mobile depth;
- editing uses the full viewport and respects the on-screen keyboard;
- Save and Close remain reachable while scrolling long content;
- menus do not render outside the viewport;
- reorder/move operations have non-drag controls;
- URL checking can continue server-side if the administrator navigates away;
- returning to the workspace shows the latest job status and warnings;
- destructive category/archive actions use explicit confirmation and name the
  affected object.

## Audit and security

All category, entry, moderation, publication, rollback and URL-check actions are
administrator-authenticated and auditable. Audit details exclude secrets and
remote response bodies. Administration endpoints enforce CSRF protection and do
not trust client-provided version, category membership or URL-check outcomes.

Remote URL validation must re-resolve and re-check every redirect target and must
not be usable as a general-purpose proxy or network scanner.

## Initial acceptance criteria

1. An administrator can edit an existing entry in the responsive floating editor
   and save it without changing the public guide.
2. Categories can be created, renamed, moved and reordered in the draft.
3. Only an empty draft category can be deleted, with repository enforcement.
4. A pending contribution can be rejected or promoted into the draft editor.
5. The complete draft publishes atomically and public readers switch together.
6. Every new or changed entry uses an external HTTPS image URL; no image is added
   to the repository.
7. The whole-guide URL checker records results and marks affected leaves with a
   warning icon without modifying their content.
8. URL warnings are acknowledged at publication rather than silently ignored or
   treated as automatic deletion.
9. All core tasks work through touch-friendly non-drag controls on a mobile phone.
10. Concurrent saves and publishes cannot silently overwrite newer work.

## Out of scope

- uploading or storing image binaries;
- automatic repair or replacement of failed URLs;
- allowing guest contributions to bypass administrator moderation;
- merging individual holiday plans;
- permanent deletion of entry revision or audit history;
- scheduled background crawling of the public internet in this PR.

## Initial implementation notes

The first implementation adds migration `044_local_guide_editorial_workspace.sql`
and delivers the database-backed working/published category tree, immutable
publication snapshots, workspace concurrency, atomic whole-guide publication,
responsive tree editor, contribution review, external image enforcement for new
or changed entries and administrator-triggered URL health checks.

Public Local Guide pages and the Booker/guest planning interfaces now resolve the
published database category tree. The original YAML category list remains only as
legacy source material and is no longer authoritative for these runtime paths.

The URL checker uses bounded concurrency and pins each HTTP connection to an IP
address that has already passed public-network validation. Redirect destinations
are independently resolved and checked. Local interactive testing intentionally
shows warnings for legacy repository-relative images; those warnings guide the
administrator's gradual replacement of old image paths with external HTTPS URLs.

The final browser review also corrected a Chromium repaint failure in the public
responsive shell. Horizontal overflow now uses repaint-safe containment instead
of `overflow-x: clip`; a mobile UI regression contract prevents the
resize-dependent disappearing-content behaviour from returning.
