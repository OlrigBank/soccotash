# Olrig Bank welcome page and printable poster

Task branch: `feat/olrig-bank-welcome-page`, started 8 October 2026.

## Objective and acceptance

Implement the supplied welcome-page handover: a public `/welcome/` page and
printable A3 poster using one structured content source, edited through
Admin → Website content → Pages CMS. All CMS shortcuts target `development`.

Acceptance includes the six supplied topics, shared contact settings, stable
fragment IDs and production QR destinations, safe editable links, retirement
of printed topics, readable phone/tablet/desktop layouts and unclipped A3/A4
print output. Preserve existing guidance routes and fragments and keep private
guest instructions out of public content.

## Implementation and editing

`site/src/data/welcome.yml` is the structured source. Both routes are prerendered
from the same validated data and shared component. The print route defaults to
A3, offers an A4 selector and uses native Browser Print / Save as PDF. QR codes
encode the fixed production origin, never the preview origin or request Host.
The help summary adds telephone and email from the existing contact settings.
The supplied logo is imported into the media library; the different untracked
`site/public/olrog-bank-green-logo.jpg` is untouched.

`BaseLayout` has a `showQuickCheck` option, defaulting to true. Welcome opts out
so the mobile booking dock does not overlay guidance. Existing navigation and
booking behaviour elsewhere retain their defaults. The welcome page is listed
in the sitemap; the print page deliberately uses `noindex`.

### Editing

1. Sign in to the website admin area and open **Website content**.
2. Choose **Open Welcome page and poster**. Pages CMS opens in a new tab; sign
   in and authorise repository access if requested.
3. Confirm the repository is `OlrigBank/soccotash` and the branch is
   `development`. All admin CMS shortcuts, including home, settings and images,
   explicitly target that branch.
4. Edit the copy or use the media picker to replace the logo and update its
   alternative text. Expand a topic to edit its summary, link or label; use
   the list controls to reorder topics or add a new one with a unique ID.
5. Leave existing IDs unchanged. To remove a topic from current guidance and
   posters, choose **Retired**; do not delete its record. Its old fragment keeps
   useful guidance. Retired IDs cannot be reused. For an exceptional correction,
   retain the previous ID under **Previous topic IDs**.
6. Enable **Include current public contact details** for a topic that needs the
   current telephone/email. Update those values through **Contact details**,
   rather than duplicating them in the summary.
7. Save, then inspect a rebuilt preview of that commit at `/welcome/` and
   `/welcome/print/`. Admin preview links show the version built into the
   website currently being viewed; they are not an unsaved CMS preview.

The CMS supplies required-field and ID/link-pattern feedback. The build performs
full schema validation, including duplicate IDs, reserved fragments and unsafe
links. CMS cannot selectively make only existing list-item IDs read-only while
allowing IDs for new items, so helper copy and history validation enforce the
editing contract. Never add private passwords, door codes or booking-specific
access instructions to this public content.

### Publication

Saving in Pages CMS commits to `development`. It does not change the public site.
Review the content-validation and browser CI checks and a rebuilt preview, then
obtain approval to merge to `main` and deploy the approved commit. This feature
does not create a preview deployment or change deployment settings.

The checked-in Render Blueprint sets `autoDeployTrigger: off`. Older deployment
documentation describes behaviour *if* automatic deployment is enabled; live
Dashboard settings were not inspected, so automatic publication is not claimed.
Verify the actual production service's repository, branch and automatic-deploy
setting before the first approved release. Old bookmarks selecting `main` can
still edit that branch if permissions allow; these link changes do not alter
GitHub permissions or branch protections.

`npm --prefix site run check:welcome-history` validates the current source and
every committed ancestral snapshot. It requires full Git history. Both relevant
CI workflows check out with `fetch-depth: 0`; a dedicated content workflow runs
on `development` and `main` pushes and pull requests. Deletion of printed IDs or
reuse of retired IDs fails this check. Make that workflow a required branch
check through the separately managed repository settings. Docker builds validate
content through prerendering; history comparison runs in CI where Git is present.

### Poster regeneration

Build the approved content and start a local production preview, then run:

```bash
WELCOME_PREVIEW_URL=http://127.0.0.1:8098 npm run export:welcome-poster
```

The exporter refuses non-local origins and creates
`output/pdf/olrig-bank-welcome-poster.pdf`, plus A3/A4 comparison PDFs with and
without backgrounds under `test-results/welcome-print/`. QR destinations remain
production URLs. Browser printing is also available without this command.
Regenerate after content publication; the checked-in poster is a review artefact,
not a separately editable content source. Existing reference-poster codes still
point directly to the original guidance routes and anchors.

## UI patterns

- **Welcome topic navigation**: custom topic list using native fragment links.
- **Welcome guidance rows**: custom ordered information rows with native links.
- **Welcome poster layout**: custom print layout using a native print button and
  the browser Print / Save as PDF dialog.
- **Single-page poster fit**: custom automatic proportional scaling with a
  native paper selector and accessible fit-status message.
- **Pages CMS welcome editor**: existing library editor and media picker, with
  structured repeated topic fields.
- **CMS publication notice**: custom informational notice with native preview
  links, explaining the selected branch and save/rebuild/publication boundary.

## Verification

Automated coverage includes schema/link validation, stable QR payloads, topic
retirement/aliases/history, contact-setting propagation, CMS branch destinations
and sitemap inclusion. The serial build regression temporarily edits local
fixtures, verifies actual rebuilt web/print output and restores original files
and build. It covers reordered/added/retired topics, long copy, escaped markup,
empty guidance and invalid production builds. Run it separately from other
builds with `npm run test:welcome-content`.

Chrome DevTools inspection uses rebuilt local previews and a disposable local
administrator, never customer credentials. Checked widths: 320 × 800,
390 × 844, 768 × 1024 and 1440 × 900. Public, print and protected admin views
have no accidental document overflow. Topic navigation, visible keyboard focus,
accessible names/heading structure, loaded images and CMS destinations were
inspected. Edited/reordered/added/retired/aliased and empty states were inspected
in a non-notifying static presentation server. No customer was contacted.

Print QA uses Chromium PDF export, Poppler rasterisation, pypdf text/page checks
and OpenCV QR decoding from the rasterised final PDF. The initial content fits
one A3 sheet; automatic fitting now also keeps A4 on one sheet. All six topic/QR pairs
stay intact, and all six codes decode to `https://olrig-bank.com/welcome/#<id>`.
At full scale, codes occupy a 33 mm square including quiet zones, with visible code widths
approximately 26–27 mm. Layout remains readable with backgrounds enabled or
disabled; solid SVG print backings preserve the green heading/footer. Long or
additional topics reduce the print scale; editors must inspect legibility in
the print preview and shorten CMS summaries if necessary.

Final verification, 8 October 2026:

- `npm --prefix site run check`: zero errors/warnings; two existing admin hints.
- `npm --prefix site run build`: passed, including both prerendered welcome routes.
- `npm --prefix site run test:booking-lifecycle`: all 94 test files passed.
- `npm run test:welcome-content`: edited/empty content and invalid-build scenarios
  passed; original welcome/contact files and final production build restored.
- Playwright welcome + shared landing-page regression: 41 passed, three correctly
  skipped desktop-only hero cases at smaller widths. All 12 welcome cases passed.
- Final mobile Lighthouse welcome audit: accessibility, best practices, SEO and
  agentic browsing all 100, with no failed audits. Print accessibility/best
  practices/agentic browsing are 100; its SEO 69 reflects deliberate `noindex`.
  Protected admin accessibility/best practices/agentic browsing are 100; its
  SEO 80 reflects the existing private layout's missing meta description.
- A scoped admin header-copy contrast correction resolves the initial 4.4:1
  finding. Final public/print/admin console inspections found no errors/warnings;
  relevant page, stylesheet, logo and QR image requests succeeded.
- The broader initial smoke attempt used an obsolete server manifest after
  rebuilding fixture content. Restarting the production preview resolved the
  missing-module responses; the complete selected regression then passed.

Durable evidence: [phone](evidence/olrig-bank-welcome-page/phone.png),
[desktop](evidence/olrig-bank-welcome-page/desktop.png),
[Lighthouse summary](evidence/olrig-bank-welcome-page/lighthouse-summary.json),
[decoded QR destinations](evidence/olrig-bank-welcome-page/qr-decoding.json).
Full session audit reports are under `/tmp/welcome-final-audit/`,
`/tmp/welcome-print-final-audit/` and `/tmp/welcome-admin-final-audit/`.
The final A3 poster SHA-256 is
`0d95bbce44e657e86eeb4fec3a8981b2694608a8522fb8d7e21e477905a9d9a7`.

Unrelated/untracked source files are preserved. The initial implementation was
merged into `development` through PR #173. Follow-up changes are on PR #174;
this task does not merge or deploy them.

### Welcome topic rows without numbers

The custom **Welcome topic rows** pattern uses unnumbered, full-width guidance
on the web page. The printable poster retains its numbered rows. Following
this adjustment, the production build and all 12 welcome Playwright cases
passed, including keyboard navigation and visible focus. Chrome DevTools
inspection covered 320 × 800, 390 × 844, 768 × 1024 and 1440 × 900 viewports:
no horizontal overflow or numerical labels on the web page; accessible topic
headings remained intact, assets returned successfully and no console errors
were observed. This small row-layout adjustment did not require a new
Lighthouse audit; the earlier page audit remains recorded above.

### Single-page poster fitting

Automatic fitting is enabled in the print template, with no CMS toggle needed.
It measures the actual print layout for the selected paper and proportionally
scales the complete poster to the available height, reserving space for rounding.
It recalculates after fonts/images load, on paper changes and before browser
printing. Nothing is truncated. Below 70%, an accessible status recommends A3
or shorter CMS summaries. Unlimited content cannot remain legible on one sheet.
Use matching paper, 100% browser scale and disabled browser headers/footers.
Without JavaScript, the page explains how to use browser scaling instead.

Verification after this change: production build and Astro check passed;
all 16 welcome Playwright cases passed across the four recorded viewports.
PDF regression checks cover A3/A4 with current and substantially longer copy.
Chrome DevTools checked the same viewports, keyboard paper selection, visible
focus, accessible status, long-content warning, no overflow, loaded resources
and no console errors. Lighthouse accessibility, best practices and agentic
browsing scored 100; SEO remains 69 because the print route is deliberately
`noindex` (reports in `/tmp/welcome-fit-audit`). Poppler visual review and pypdf
checks confirmed complete one-page A3/A4 PDFs with backgrounds on/off. All six
QR codes decoded again from that A3 PDF. For the original six-topic content,
A3 scale was 100%; A4 was about 67%. Physical print/browser settings remain
a release check.

### CMS-edit validation correction

Development's Pages CMS commit `095a5aa` added a seventh topic, exposing fixed
six-topic and last-topic assumptions in CI. Mutation/build scenarios now use
`tests/fixtures/welcome.yml`, an isolated stable fixture; they still restore the
actual CMS content after every run. Public browser checks derive topic counts,
titles and navigation destinations from the checked-out CMS content, including
the empty state, and continue checking actual link responses and fragments.
Three CMS destinations that referenced nonexistent `/welcome/` subpages now
point to the existing house essentials, garden guidance and booking routes.
The existing report-upload step warns when an earlier build failure means no
Playwright report exists, avoiding a misleading secondary validation failure.

The content-build regression and historical-content validation pass with the
current CMS edits. Chrome DevTools checked seven-topic web guidance at all four
recorded viewports with no overflow or console errors. Refreshed A3/A4 PDFs
both contain one complete page; current fit is about 90%/57% respectively.
All seven final A3 QR payloads decode from the rasterised PDF, with the seventh
verified from a resized crop. The A3 poster was rendered and visually inspected.
The full local public regression run passed 215 cases before its preview process
stopped; the 38 remaining connection failures passed after restarting the
preview. Together, all 253 applicable cases passed, with three intentional
viewport skips. No application assertion failed on the rerun.

### Remaining release checks

- Hosted CMS sign-in preserves the exact development welcome-editor destination.
  An authenticated hosted save is not exercised: the feature configuration is
  still on this local branch and no external CMS commit was performed for
  that verification. Rebuilt fixture tests verify the content contract.
- `/welcome/` is not deployed yet, so production QR fragment destinations must
  be checked after the approved release before hanging the poster. Existing
  linked guidance routes/anchors are verified in the rebuilt application.
- A real phone scan from a physical A3 print remains an owner-side check before
  hanging the poster. Digital decoding does not substitute for it.
