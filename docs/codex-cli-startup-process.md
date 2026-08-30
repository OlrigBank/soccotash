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

Do not use the ChatGPT in-app Browser, Browser discovery, node_repl browser
runtime, @Browser, or Computer Use.

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
