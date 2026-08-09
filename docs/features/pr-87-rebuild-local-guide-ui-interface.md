# Proposed PR #87 — Rebuild the public Local Guide as nested disclosure navigation

## Status

- Parent branch: `development`
- Feature branch: `pr-87-rebuild-local-guide-ui-interface`
- Intended merge target: `development`
- Primary audience: visitors browsing the public Local Guide, particularly on mobile
- Database changes: not expected
- Current status: implementation complete; final review and PR preparation pending

## Objective

Replace the public Local Guide’s card-and-page category browsing with one compact,
mobile-first hierarchical interface. Visitors should be able to open category
folders inline, keep several branches open at the same time, and see published
recommendations as simple one-line links beneath their categories.

The interaction should feel like browsing folders without forcing the visitor
through a sequence of category pages. Opening one branch must not close another.
A branch remains open until the visitor explicitly closes it.

## Evaluation of the supplied AI response

The response correctly identifies the general family of patterns and, most
importantly, distinguishes the requested multi-open behaviour from a strict
accordion. Its branch/leaf terminology and recommendation to expand content in
place are useful and fit the current Local Guide hierarchy.

The accepted product term for this feature will be **nested disclosure list** or
**collapsible tree navigation**. We should not describe the initial implementation
as a formal ARIA `tree` widget. A true ARIA tree is a composite application widget
with prescribed roving focus, arrow-key navigation, selection semantics and
additional screen-reader expectations. Those behaviours are not required for a
public list of links and can make ordinary mobile and keyboard browsing less
natural.

The preferred foundation is recursively nested semantic `<details>` and
`<summary>` disclosure elements containing ordinary links. This provides native
tap, pointer, keyboard and screen-reader expand/collapse behaviour, retains a
useful no-JavaScript baseline, and permits multiple branches to remain open.
JavaScript may progressively enhance state restoration and focus, but must not
be required to reveal or follow Local Guide content.

## Existing context

The repository already provides:

- a canonical Local Guide category taxonomy in `src/data/navigation/main.yml`;
- stable category IDs and explicit parent IDs, including nested categories;
- published Local Guide entries stored in PostgreSQL;
- repository boundaries that exclude drafts, unpublished entries and archived
  content from public results;
- stable public entry URLs and category URLs;
- category and descendant helpers in `src/lib/navigation.ts`;
- existing entry-detail pages at `/local-guide/[slug]/`.

PR #87 is an interface and presentation rebuild. It must consume those existing
sources rather than introduce a second category model or move published content
back into static files.

## Initial product definition

### 1. Local Guide landing page

The public `/local-guide/` page becomes the primary hierarchy browser. Beneath a
short heading and introduction, it renders the complete published category tree
in source order.

The current grid of category cards and the separate “All recommendations” card
grid are removed from the primary browsing experience. Example Holiday Plans may
remain as a separate section after the guide hierarchy unless an iteration
explicitly relocates them.

### 2. Branches: category folders

Each category that contains child categories or published entries is a branch.
A branch row contains:

- a native disclosure indicator or consistent chevron;
- the category label;
- the total number of published recommendations in that category and all its
  descendants;
- optionally, a short description only where it does not make the hierarchy
  difficult to scan.

Branches are collapsed on first visit unless a later iteration identifies a
specific branch that should be initially open. Tapping or activating the branch
row expands its children directly underneath it and pushes following content
down the page. Activating it again collapses that branch.

Opening a branch must not close its siblings, ancestors or other open branches.
Collapsing a parent hides all descendants but should preserve their individual
open states while the page remains loaded, so reopening the parent restores the
visitor’s working context.

### 3. Leaves: recommendation links

Published recommendations are leaves. Each leaf is rendered as one compact,
single-line row containing its title as an ordinary link to the existing public
entry-detail page.

A leaf:

- has no disclosure control;
- is visually distinguishable from a folder;
- truncates or wraps safely when a title is unusually long, without causing
  horizontal page overflow;
- remains a real server-rendered link so standard open-in-new-tab, copy-link,
  browser history and search indexing behaviours continue to work.

Entries belonging directly to a category appear within that category alongside
any child-category branches. The ordering rule must be deterministic and tested.
The initial rule is child categories in taxonomy order, followed by entries in
the existing public repository order.

### 4. Recursive hierarchy

The renderer must be recursive rather than hard-coded for the current depth.
The present taxonomy includes top-level, child and grandchild categories, and
future taxonomy changes should not require new page markup.

Indentation communicates depth, but must be capped or adapted on narrow screens
so deeply nested content retains useful width. Category identity and parentage
come from the canonical navigation data; entry membership comes from the
published database record’s category ID.

### 5. Navigation and disclosure state

During the life of the page, every branch retains its state until the visitor
explicitly changes it. Multiple expanded branch IDs may be stored in
`sessionStorage` as a progressive enhancement so returning from an entry through
browser Back restores the same browsing context within that tab.

State restoration must:

- use stable category IDs rather than labels or display order;
- be scoped and versioned for the public Local Guide;
- ignore unknown or removed category IDs safely;
- never delay or prevent the server-rendered hierarchy from being usable;
- avoid storing visitor identity, entry content or other personal information.

Cross-device persistence, account-level preferences and database persistence are
out of scope.

### 6. Category URLs and entry pages

Existing category URLs must continue to resolve for bookmarks, external links and
search engines. An initial implementation may retain their current category-page
presentation or render the same hierarchy focused on the requested category.
It must not remove or silently repurpose stable routes without an explicit redirect
and SEO decision.

Existing entry-detail pages remain the destination for leaf links. Entry content,
images, external links, aliases, cache policy, sanitisation and unpublished-content
protection are not redesigned by this PR.

### 7. Holiday Planner integration

The Booker’s embedded Local Guide uses the same recursive disclosure component
and canonical hierarchy as the public guide. Planner recommendation leaves remain
compact new-tab links and retain their grip, drag-to-candidates metadata and
keyboard-select-to-add action. Its expanded-folder state is stored under a
separate session key so public browsing and private planning do not overwrite one
another.

In the Planner, a whole category can also be dragged into Candidate activities.
This adds every published recommendation directly assigned to that category or
any of its descendant categories, preserving the Local Guide ordering. The
category grip communicates the drag action, and an “Add all” button inside the
open category provides the equivalent keyboard and touch action.

The category operation is one atomic plan revision. Recommendations already in
Candidate activities or already scheduled on any day are skipped, so the action
never creates duplicate Local Guide activities. If every recommendation is
already present, the Planner explains that nothing was added. Draft, unpublished
and archived recommendations remain unavailable through this operation.

## Accessibility requirements

- Use nested `<details>` and `<summary>` elements for category disclosures unless
  testing demonstrates a concrete browser defect that requires another semantic
  implementation.
- Do not add `role="tree"`, `treeitem` or custom arrow-key handling unless the full
  WAI-ARIA tree interaction model is intentionally implemented and tested.
- Every category summary must have an understandable accessible name and expose
  its open/closed state natively.
- Recommendation titles remain ordinary links with visible keyboard focus.
- Disclosure and link targets should be at least 44 CSS pixels high where
  practical.
- Folder/leaf and open/closed state must not depend on colour alone.
- Content order must remain meaningful when CSS is unavailable.
- The hierarchy must work with JavaScript disabled.
- Programmatic state restoration must not unexpectedly steal focus.

## Mobile and responsive requirements

- The hierarchy is usable at 320px, 375px and 430px without document-level
  horizontal scrolling.
- A category opens inline; it does not use a modal, drawer or full-screen
  drill-down page.
- Only the hierarchy container scrolls with the document; nested regions do not
  introduce competing vertical scroll areas.
- Indentation, icons, counts and titles leave enough width for recommendation
  text at every supported depth.
- Touching a disclosure must not accidentally activate a category or entry link.
- Layout and state changes should not require animation; any animation added must
  respect reduced-motion preferences.

## Data and publication rules

- Render only entries returned through the public published-entry repository.
- Do not expose working revisions, drafts, unpublished or archived content.
- Counts are calculated from the same published entries rendered in the tree and
  include descendant categories exactly once.
- Empty categories may remain visible when they contain non-empty descendants;
  a category with neither visible entries nor visible descendants is omitted from
  the public hierarchy.
- Missing or invalid entry category IDs must fail safely and must not make the
  entire Local Guide unavailable.
- No database migration is expected. Any discovered schema requirement must be
  brought back for explicit scope review before implementation.

## Performance and progressive enhancement

- Render the hierarchy on the server in the initial HTML; do not fetch every
  category only after it is opened.
- Avoid one database query per category. Published entries should be loaded once
  and grouped against the in-memory canonical taxonomy.
- Closed disclosures may contain server-rendered links; this is intentional for
  resilience, ordinary browser behaviour and discoverability.
- Client scripting is limited to optional state restoration and small interaction
  refinements.
- The result must remain practical with the current guide and should be measured
  with a substantially larger fixture to prevent accidental quadratic rendering.

## Out of scope for the initial feature

- Local Guide editorial administration or publication workflow changes.
- Category creation, deletion, reparenting or ordering tools.
- Database schema changes or migration of the navigation taxonomy.
- Search, filtering, maps, geolocation or personalised recommendations.
- Redesigning Holiday Planner candidate or itinerary behaviour beyond replacing
  its embedded Local Guide browser with the same disclosure hierarchy.
- Redesigning recommendation detail content.
- A strict one-open-at-a-time accordion.
- Full-screen mobile drill-down navigation.
- A formal ARIA tree widget with application-style keyboard selection.

## Acceptance criteria

- `/local-guide/` renders the canonical category hierarchy recursively.
- Categories expand and collapse inline using native disclosure semantics.
- Opening one category does not close another open category.
- An open category stays open until explicitly closed while the page remains
  loaded.
- Collapsing and reopening a parent restores descendant disclosure state during
  that page visit.
- Published recommendations appear as compact title links under the correct
  categories and open their existing detail pages.
- Recommendation counts match the rendered published data, including descendants.
- Category pages and entry URLs continue to resolve safely.
- The Booker Planner renders the same multi-open hierarchy while preserving
  drag-to-candidates and keyboard add behaviour.
- Dragging a Planner category into Candidate activities adds its published
  recommendations and those of its descendants in one atomic revision.
- Category batch-add skips recommendations already in candidates or scheduled
  in the plan, and provides an equivalent touch and keyboard control.
- The hierarchy remains usable without JavaScript.
- Optional session restoration safely restores expanded stable category IDs after
  returning through browser Back.
- Keyboard and screen-reader users can operate every disclosure and link.
- The page has no horizontal overflow at 320px, 375px or 430px.
- Existing unpublished-content, alias, sanitisation and database-unavailable
  boundaries do not regress.

## Validation plan

- Unit tests for recursive category construction, descendant counts, empty-branch
  pruning and deterministic ordering.
- Contract tests for semantic disclosure markup, real leaf links and absence of
  inappropriate ARIA tree roles.
- Public repository integration tests proving only published revisions appear.
- Route tests for the landing page, category URLs, entry URLs, aliases, 404 and
  database-unavailable behaviour.
- Browser tests that open multiple sibling and nested branches, close/reopen a
  parent, follow an entry and restore context with browser Back.
- JavaScript-disabled browser check.
- Keyboard and representative screen-reader review.
- Responsive checks at 320px, 375px, 430px and desktop widths.
- `npm run test:booking-lifecycle` for existing cross-feature contracts.
- Relevant Local Guide integration tests.
- `npm run check` and `npm run build`.
- `git diff --check`.

## Implemented interface decisions

- Category descriptions appear at the top level and are suppressed on narrow
  mobile screens; nested rows remain compact.
- Descendant-inclusive recommendation counts remain visible at every level.
- Existing category routes retain their current presentation and stable URLs.
- Session restoration is enabled with separate versioned keys for public and
  private Planner browsing.
- Native disclosure semantics are paired with a restrained chevron and capped
  indentation rather than custom ARIA tree behaviour.
- Planner entries and categories expose six-dot drag grips, with buttons as the
  touch and keyboard alternatives.

## Implementation and validation summary

Implemented on `pr-87-rebuild-local-guide-ui-interface`:

- a shared recursive Local Guide tree builder and disclosure renderer;
- public Local Guide landing-page integration;
- private Booker Planner integration with an independent disclosure-state key;
- individual recommendation drag/add and whole-category drag/add;
- descendant-aware counts, empty-branch pruning and publication-safe data access;
- atomic category candidate insertion with duplicate protection across both the
  candidate backlog and scheduled plan items.

Final readiness validation completed on 9 August 2026:

- all 43 booking-lifecycle contract tests pass;
- all 11 PostgreSQL integration tests pass;
- `astro check` reports no errors or warnings (two pre-existing informational
  hints remain outside this feature);
- the production server build passes;
- the public Local Guide and private Planner were reviewed at 320px against the
  local Docker deployment;
- the public hierarchy was also checked at 375px, 430px and desktop widths during
  implementation, including multi-open and restored nested disclosure state;
- `git diff --check` passes.

## Source material supplied for evaluation

### Question to AI

> I need to have a mechanism that works on a mobile device that allows a user to
> navigate through the categories open and closing folders. When a folder is open
> the contents of that folder is shown as one line entries. A folder stays open in
> the hierarchy until it is click closed. Describe that mechanism and give me the
> accepted technical name for this mechanism

### AI response

> Identified hierarchical navigation component and established standard
> technical terminology
>
> This is a well-established UI pattern. The accepted technical name is a tree
> view (also called a disclosure tree or expandable/collapsible tree navigation)
> — the same pattern used in file-system browsers (Finder, Windows Explorer), and
> formally defined in the WAI-ARIA spec as the tree/treeitem role, built from
> repeated disclosure widgets (the ARIA term for a single expand/collapse toggle,
> aria-expanded).
>
> **How it applies to your Local Guide structure**
>
> Given your category hierarchy — Local guide → Outdoor pursuits → Close to home /
> Further afield / Cycling, etc. — each level is a node, and each node is either:
>
> - a branch (a folder — has children, shows an expand/collapse control), or
> - a leaf (a single recommendation — no children, just navigates on tap)
>
> **Mechanism behavior**
>
> Collapsed by default — top level shows just the folder rows (e.g. "Outdoor
> pursuits," "In Kendal," "Festivals"), each with a disclosure indicator
> (chevron/triangle) and ideally the item count you're already showing ("16
> recommendations").
>
> Tap a folder row → it expands in place. Its children render as indented
> single-line entries directly below it, pushing everything below further down
> the page (an accordion-in-tree, not an overlay/modal).
>
> Persistent state — critically, per your spec: opening one folder does not
> auto-close sibling folders (that would make it a strict "accordion," which only
> allows one open panel at a time). Your requirement — stays open until explicitly
> closed — means multiple branches can be expanded simultaneously, which is
> standard tree-view behavior, not accordion behavior. This distinction matters a
> lot for what you tell a developer to build.
>
> Nested folders — a sub-folder (e.g. "Close to home" inside "Outdoor pursuits")
> behaves the same way recursively: tap to expand, its leaves show as single-line
> rows, tap the folder again (or its chevron) to collapse — collapsing a parent
> should also visually collapse its children's state (or at minimum hide them;
> whether it forgets the child's open/closed state on re-open is a decision worth
> pinning down).
>
> Leaf rows — single line each, tap navigates straight to that recommendation's
> page (no expand behavior).
>
> **Naming precision for a dev handoff**
>
> General pattern: tree view / collapsible tree navigation
>
> Single toggle unit: disclosure widget / disclosure triangle
>
> Explicitly not an accordion (single-open-panel-at-a-time) — worth stating that
> distinction outright in a spec, since "accordion" and "tree" get used
> interchangeably by less precise devs and it'll change the implementation.
>
> On mobile specifically, this is sometimes also called a drill-down-free tree
> menu or nested disclosure list, as opposed to the alternative "drill-down"
> pattern (tap folder → navigate to a new full-screen list, with a back button) —
> which is the other common mobile pattern and worth ruling out explicitly since
> your spec (folders stay open in place, inline) is the tree-view approach, not
> drill-down.
>
> Accessibility note: if this ships as real HTML, the natural building blocks are
> either semantic `<details>/<summary>` elements (native, free expand/collapse,
> but harder to control "stay open across navigation" state) or a custom
> implementation using `role="tree"`, `role="treeitem"`, `aria-expanded`, and
> `aria-level` for screen reader support.
