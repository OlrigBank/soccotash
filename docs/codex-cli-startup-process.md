# Codex CLI startup and UI verification

## Initial implementation audit

Audit the current implementation from evidence; do not assume the previous
session’s claims are correct.

First:

1. Inspect git status and the complete diff.
2. Identify the application start command and local URL.
3. Confirm that the browser tool works by opening the application and reporting
   the actual page title and URL.
4. Inspect the rendered UI before making further changes.

For every UI change:

- reload the current build;
- inspect the result in the browser;
- test at 390×844, 768×1024, and 1440×900;
- check console errors, failed network requests, overflow, and interaction;
- capture screenshots as evidence.

Do not claim that a visual change succeeded unless you observed it in the
browser after the change. If browser access fails, stop and report the exact
tool failure rather than inferring the result from source code.

## Playwright MCP requirements

This is Codex CLI running inside WebStorm.

For local application UI verification, do not use the ChatGPT in-app Browser,
Browser discovery, node_repl browser runtime, @Browser, or Computer Use.

Use the MCP server named `playwright` directly. First call its
`browser_navigate` tool to open https://example.com and report the page title.
If that succeeds, use Playwright to open the local application.

For responsive verification, use Playwright's browser tools to:

- navigate to the local URL;
- resize to 390×844, 768×1024, and 1440×900;
- take a screenshot at each size;
- inspect console messages and failed requests.

Do not report “No browser is available” based on Browser discovery. Only report
failure if an actual `playwright` MCP tool call fails, and include that exact
tool error.

## Existing Chrome sessions and sandbox visibility

The Playwright instructions above apply to local application verification. They
do not apply when a task explicitly depends on the user's existing Chrome state,
such as an already-open signed-in Airbnb tab. For that task, use the available
Chrome-control skill and its documented browser connection rather than opening a
separate Playwright session.

Do not conclude that Chrome is absent merely because `ps`, `pgrep` or another
process command cannot see it. Codex shell commands may initially run inside a
sandboxed PID namespace that cannot see host desktop processes. In the Airbnb
review session, a sandboxed process check incorrectly appeared to show that no
Chrome-family browser was running. A permitted host-level process check later
confirmed both Chromium and Google Chrome processes on the machine.

Process presence and browser controllability are separate facts:

- a host-level process check can establish that Chrome or Chromium is running;
- the Chrome-control connection establishes whether Codex can inspect and
  operate that browser; and
- a running browser is not controllable until the ChatGPT Chrome extension and
  its native connection are installed, enabled and connected.

When an existing Chrome task appears unavailable:

1. Read and follow the Chrome-control skill before attempting browser actions.
2. Try the documented Chrome browser binding and report its exact connection
   error if it fails.
3. If process detection is relevant, recognise the sandbox limitation and use
   an appropriately permitted host-level check; do not treat an empty sandboxed
   process list as evidence that the browser is closed.
4. Follow the skill's extension and native-host troubleshooting steps when the
   process exists but the browser binding is disconnected.
5. Once connected, discover current user tabs and claim the exact returned tab;
   never guess or reuse a tab, browser or extension ID from another session.

Do not use host-process visibility as a substitute for the browser connection,
and do not use failure of the browser connection as proof that no Chrome process
exists. State which of those two checks failed.

## Session handoff checklist

At the beginning of a resumed session, do not assume that the previous session's
runtime state still exists. Establish the current state from evidence:

1. Check the current branch, working tree, staged changes and complete diff.
2. Check whether the relevant branch has been pushed and whether an open pull
   request or CI run already exists.
3. Treat local development servers and temporary deployment URLs as ephemeral;
   verify the process and request the health or page URL before relying on it.
4. Treat browser bindings, claimed tabs, tab IDs, review IDs held in memory and
   extension connection state as session-specific. Reconnect, rediscover and
   claim the current tab rather than reusing an earlier handle.
5. Recheck that raw PDFs, private manifests, temporary HTML, extracted text and
   rendered review material are covered by the intended Git ignore rules before
   staging changes.
6. Distinguish committed, pushed, pull-requested and merely local changes in the
   handoff. Do not describe one state as another.
7. Verify important previous-session claims—tests, builds, browser rendering,
   deployments and external status—when they affect the next action.

At the end of a session, leave a concise handoff that identifies:

- the current branch and pull request, if any;
- uncommitted or unpushed changes;
- tests and builds actually run and their results;
- any local server intentionally left running and its URL;
- private or ignored artifacts that must remain local; and
- the next incomplete task or known blocker.
