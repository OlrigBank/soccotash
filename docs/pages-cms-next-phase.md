# Pages CMS next phase

## Goal

Use Pages CMS as the editor for the Astro content files, without adding a runtime database or a separate CMS backend to the public website.

Pages CMS edits Markdown, YAML and media directly in GitHub. A content edit creates a Git commit. Render then rebuilds the static Astro site from the updated repository.

## Phase 1: Repository and CMS wiring

1. Push this project to a GitHub repository.
2. Keep `.pages.yml` at the repository root.
3. Install the Pages CMS GitHub App on the repository.
4. Open the repository in the hosted Pages CMS app.
5. Confirm that the editor shows:
   - Local guide
   - General pages
   - Listings
   - Site settings
   - Contact details
   - Navigation structure
6. Make one harmless edit, save it, and confirm that a commit appears in GitHub.

## Phase 2: Editorial workflow

1. Expand placeholder local guide bodies.
2. Replace short legacy bodies such as “Babaganoush” with useful guest-facing text.
3. Check category assignment for every local guide entry.
4. Add final listing text for Main House, Cottage and Event/whole-property use.
5. Add contact details only when the public contact policy is confirmed.
6. Decide who is allowed to edit content and whether edits go directly to `main` or through pull requests.

## Phase 3: Preview and deployment workflow

1. Keep Render auto-deploy enabled for the test service.
2. Every Pages CMS commit should trigger a Render rebuild.
3. Use the Render test URL to verify content before pointing any production domain at the site.
4. Only after testing, add the production domain and update `site/src/data/settings/site.yml` if needed.

## Phase 4: Hardening

1. Replace placeholder content.
2. Add image size rules and image optimisation.
3. Add a simple CI check: `npm --prefix site ci && npm --prefix site run check && npm --prefix site run build`.
4. Review accessibility and mobile pages on real devices.
5. Decide whether the navigation YAML should stay manually editable or be generated from categories.
