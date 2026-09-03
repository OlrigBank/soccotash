# Repository Working Instructions

## Language

- Use British English in interface copy, documentation, tests and ordinary
  identifiers, even when the request uses an American spelling or contains a
  spelling mistake.

## Browser verification for UI work

- Treat Chrome DevTools inspection as a required completion step for every
  meaningful customer-facing UI or workflow change.
- Inspect the rebuilt, running application rather than relying only on source
  review or static component tests.
- Exercise representative phone, tablet and desktop widths. Check document and
  intentional local overflow, keyboard operation, visible focus, accessible
  names and structure, console errors, relevant network behaviour and the
  important success, empty, validation and continuation states.
- Run a Lighthouse audit for new pages, shared layouts, substantial visual or
  responsive changes, accessibility work and important customer journeys.
  Investigate applicable failures, correct regressions within scope and repeat
  the audit after a correction.
- Do not treat a Lighthouse score as sufficient evidence by itself. Pair it
  with task-level browser inspection and permanent automated coverage where the
  behaviour is important or likely to regress.
- Use Playwright for repeatable browser workflows and CI regression protection;
  use Chrome DevTools and Lighthouse for interactive inspection, diagnosis and
  page-quality evidence.
- Never expose a real customer credential or contact a customer during browser
  verification. Use disposable local fixtures, non-notifying previews or a
  representative presentation harness, and document any resulting limitation.
- Record the viewports, states and tools checked, material findings and any
  limitation in the feature record or completion hand-off.

These browser requirements do not apply to a change that cannot affect rendered
UI, such as an isolated database migration, internal script or documentation-only
edit. If a supposedly non-UI change alters generated markup, routing, response
headers or client behaviour, perform the relevant browser checks.
