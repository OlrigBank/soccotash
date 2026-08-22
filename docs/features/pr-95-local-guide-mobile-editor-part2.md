# Proposed PR #95 — Local Guide Mobile Editor, Part 2

## Status

- Parent branch: `development`
- Feature branch: `agent/local-guide-mobile-editor-part2`
- Intended merge target: `development`
- Current status: iteration 1 implemented and verified; ready to merge
- Database changes: required

## Objective

Refine the Local Guide editorial workspace through small, testable corrections
found during administrator use. Preserve the working-versus-published model and
the contribution audit trail established by PR #92.

## Iteration 1 — contribution URLs and incomplete-draft closing

### Preserve a Booker candidate's website URL

A custom activity retained from a Booker's plan may include a source URL. That
URL is part of the explicitly offered candidate content and must survive the
complete moderation path:

1. snapshot it when the contribution candidate is created;
2. display it while the administrator examines the candidate;
3. allow the administrator to review or correct it;
4. store the reviewed URL in the moderation record;
5. use it as the promoted draft revision's website URL.

The retained offered URL must not depend on the source plan remaining present or
unchanged. Existing candidates should be backfilled from their still-linked plan
candidate or scheduled item where possible. URLs remain limited to HTTP or HTTPS
and 2,000 characters.

For a new Local Guide entry, a blank candidate URL produces a draft with no
website URL. For a suggested update, a supplied reviewed URL replaces the
working revision's website URL; a blank reviewed URL preserves the existing
website URL.

### Close an incomplete draft

Close and Cancel controls are navigation actions, not save attempts. They must
be able to dismiss an editor even when required fields—particularly the image
URL—are empty or currently invalid. Browser form validation continues to apply
to Save and moderation decisions.

All Local Guide workspace dialogs should follow the same rule so an
administrator cannot become trapped inside an incomplete entry, category or
candidate editor.

## Acceptance criteria for iteration 1

1. A retained custom plan candidate snapshots its source URL.
2. Candidate moderation displays and submits the offered URL.
3. Promotion to a new Local Guide draft retains the reviewed URL as the draft's
   website URL.
4. A suggested update uses a supplied reviewed URL without erasing an existing
   URL when the reviewed field is blank.
5. Existing linked candidates are backfilled where their source URL is still
   available.
6. Close controls dismiss all workspace dialogs without triggering required-field
   validation.
7. Save and Accept continue to enforce their existing validation.
8. Contract and repository integration tests cover the corrected behaviour.

## Later iterations

Further small editor problems discovered during interactive use will be added as
separate sections with their own acceptance criteria. They should not broaden or
weaken the Local Guide publication, audit, concurrency or security guarantees.
