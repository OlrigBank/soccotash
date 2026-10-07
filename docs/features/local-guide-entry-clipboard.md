# Local Guide entry clipboard transfer

Working draft editors provide **Copy entry**. It copies the current form contents,
including unsaved changes, to the system clipboard. Close the editor and choose
**Create entry** on either deployment to pre-fill a new draft from a recognised,
valid copy. Review the contents and save explicitly; nothing is published.

The versioned JSON format transfers title, slug, category, image path, website,
summary, body and recommendation status. Database identifiers and revisions are
excluded. A missing destination category requires a selection. An existing slug
must be changed before saving. Images are referenced, not transferred: bundled
paths need the corresponding asset on the destination deployment.

Browser clipboard permissions and secure-context restrictions can prevent direct
access. **Paste copied entry** provides a manual textarea fallback. Failed copying
selects the serialised contents for manual copying. Unrelated clipboard text opens
a blank new draft; invalid pasted contents show a validation message. Copying does
not save the source, and pasting cannot replace an existing entry.

## UI patterns

- **Entry clipboard transfer**: custom workflow using native buttons, the native
  entry dialog and the browser Clipboard API.
- **Manual entry paste**: custom fallback composed of native details, textarea and
  button controls, with a live status message.

## Verification

Verified against the rebuilt application with a disposable local database fixture,
without customer credentials, notifications or production changes.

- Playwright: 12 passing cases at 390 × 844, 768 × 1024 and 1440 × 900. Covered
  native clipboard permission grants, transfer between different origins, unsaved
  content, new-entry identity, explicit saving, denied access, manual paste,
  invalid text and missing categories. Cross-origin automation uses a shared
  clipboard binding; a separate case exercises the native browser clipboard.
- Chrome DevTools: editor inspection at all three widths; no document or dialog
  horizontal overflow, keyboard focus visible, controls named, empty image preview
  hidden and no console errors. Real clipboard copying succeeded; interactive
  reading can wait for browser permission. Automated native reading uses permission
  grants in an isolated test context.
- Lighthouse mobile editor snapshot: accessibility 100, best practices 100,
  agentic browsing 100, SEO 75. The sole failure is the existing administration
  page's missing meta description, outside the clipboard workflow.
- Lifecycle suite: 93 files passed. Astro check: zero errors or warnings (two
  existing hints). Production build and whitespace checks passed.
