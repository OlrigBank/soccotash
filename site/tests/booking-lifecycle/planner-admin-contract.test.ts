import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const apiUrl = new URL('../../src/pages/api/admin/planner/action.ts', import.meta.url);
const middlewareUrl = new URL('../../src/middleware.ts', import.meta.url);
const layoutUrl = new URL('../../src/layouts/AdminLayout.astro', import.meta.url);
const detailUrl = new URL('../../src/pages/admin/planner/[id].astro', import.meta.url);
const previewUrl = new URL('../../src/pages/admin/planner/[id]/preview.astro', import.meta.url);
const publicUrl = new URL('../../src/pages/holiday-plans/[slug].astro', import.meta.url);
const itineraryUrl = new URL('../../src/components/PlanItinerary.astro', import.meta.url);
const migrationUrl = new URL('../../db/023_holiday_planner_publication.sql', import.meta.url);

test('Admin Planner routes retain authentication, same-origin and accessible ordering contracts', async () => {
  const [api, middleware, layout, detail, preview, publicPage, itinerary, migration] = await Promise.all([
    readFile(apiUrl, 'utf8'), readFile(middlewareUrl, 'utf8'),
    readFile(layoutUrl, 'utf8'), readFile(detailUrl, 'utf8'), readFile(previewUrl, 'utf8'),
    readFile(publicUrl, 'utf8'), readFile(itineraryUrl, 'utf8'), readFile(migrationUrl, 'utf8'),
  ]);

  assert.match(middleware, /path\.startsWith\('\/api\/admin\/'\)/, 'Admin APIs must remain session protected');
  assert.match(api, /isSameOrigin\(request\)/, 'planner mutations must enforce same-origin submission');
  assert.match(api, /locals\.adminUser!\.id/, 'planner mutations must attribute the authenticated administrator');
  assert.match(api, /STALE_REVISION/, 'the route must preserve explicit stale-edit responses');
  assert.match(layout, /\/admin\/planner\//, 'Admin navigation must expose the Planner workspace');
  assert.match(detail, /aria-label={`Move \$\{day\.title\} up`}/, 'day ordering needs an accessible move-up control');
  assert.match(detail, /aria-label={`Move \$\{day\.title\} down`}/, 'day ordering needs an accessible move-down control');
  assert.doesNotMatch(detail, /draggable=/, 'drag and drop must not be the only day-ordering interface');
  assert.match(detail, /data-item-move="up"/, 'items need an accessible move-up control');
  assert.match(detail, /data-item-move="down"/, 'items need an accessible move-down control');
  assert.match(detail, /Remove this item and discard its plan-specific content\?/, 'item removal must require explicit confirmation');
  assert.match(api, /updatePlanItem/, 'item changes must use the transactional planner service');
  assert.match(api, /localGuideEntryId/, 'guide mutations must pass stable database entry IDs');
  assert.match(detail, /Unavailable Local Guide entry:/, 'unavailable guide references need a visible non-destructive warning');
  assert.match(detail, /Custom item · potential future Local Guide candidate/, 'custom items should remain visibly distinct');
  assert.match(detail, /data-guide-filter/, 'administrators need a guide search control');
  assert.match(detail, /Revision history/, 'administrators need visible plan history');
  assert.match(detail, /Duplicate as draft/, 'complete plans need an explicit duplication control');
  assert.match(api, /duplicateExamplePlan/, 'duplication must use the transactional planner service');
  assert.match(api, /publishExamplePlan/, 'publishing must use the transactional planner service');
  assert.match(api, /unpublishExamplePlan/, 'unpublishing must use the transactional planner service');
  assert.match(detail, />Preview</, 'drafts need an authenticated presentation preview');
  assert.match(detail, /Publish/, 'administrators need an explicit publish action');
  assert.match(detail, /Unpublish/, 'administrators need an explicit unpublish action');
  assert.match(preview, /PlanItinerary/, 'preview must use the shared presentation component');
  assert.match(preview, /private, no-store/, 'preview responses must never be cached publicly');
  assert.match(publicPage, /PlanItinerary/, 'public pages must use the shared presentation component');
  assert.match(publicPage, /getPublishedExamplePlanBySlug/, 'public routes must use the publication-filtered query');
  assert.match(publicPage, /status = 404/, 'unavailable plans need a non-disclosing not-found response');
  assert.match(publicPage, /no-store/, 'unpublishing must take effect without a stale public cache');
  assert.doesNotMatch(itinerary, /reservationNote|revisions|adminUserId/, 'public presentation must omit private and audit fields');
  assert.match(itinerary, /item\.visibility !== 'private'/, 'private items must not render publicly');
  assert.match(itinerary, /From the Olrig Bank Local Guide/, 'guide content must be distinct from plan notes');
  assert.match(itinerary, /Plan note/, 'plan-specific content must remain visibly distinct');
  assert.match(migration, /UNIQUE INDEX[\s\S]*public_slug/, 'public slugs must be collision-safe at the database boundary');
});
