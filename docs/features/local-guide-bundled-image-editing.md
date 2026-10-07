# Editing local guide entries with bundled images

Ruskins Bar retains `/media/images/local-guide/ruskins.png`. The editor formerly
used an HTML URL input restricted to HTTPS, so the browser rejected this bundled
path before saving. Workspace publication also rejected any changed entry with
a bundled image, even though revision storage accepted it.

The editor now accepts either an HTTPS image URL or a bundled `/media/images/`
path. Server validation and publication use the same image rules. Unsafe schemes,
protocol-relative addresses, credentials and path traversal are rejected. URL
health checks inspect bundled files in the compiled assets/public directory
without an external network request, and warn when a file is missing.

**Bundled image field** is an off-the-shelf native text input with required and
pattern validation, within the existing entry dialog. No new custom UI pattern,
layout, migration or public API is introduced.

## Verification

- Unit coverage accepts the Ruskins path and HTTPS images, and rejects traversal,
  encoded traversal, protocol-relative links, other schemes and malformed URLs.
- PostgreSQL integration edits and publishes Ruskins while retaining its image,
  and checks its bundled asset successfully. Existing reorder/rollback cases pass.
- Playwright passes edit/save/publish/public-entry checks at 390 × 844,
  768 × 1024 and 1440 × 900. The test lives in the existing request-journey suite
  so CI covers it. The local run used a stable production-build administrator
  preview with an isolated disposable database.
- DevTools verified the native image field accepts the bundled path and saving
  increments the draft version; checked phone/tablet/desktop document overflow
  (none) and console errors/warnings (none). No customer credentials, remote
  website checks or real notifications were used.
- All 92 lifecycle test files pass; Astro check has zero errors/warnings and two
  existing hints; production build passes.

## Running application

Read-only inspection found the existing category-publication fix in the running
container. The supplied error log refers to the older `workspace_CPTfQ9Fj.mjs`
bundle, while the running container contains the corrected compiled workspace.
This image-field change still requires an application rebuild. Live guide data
was not changed, and the container was not rebuilt during this task.
