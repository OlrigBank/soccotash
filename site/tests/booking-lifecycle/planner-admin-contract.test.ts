import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const apiUrl = new URL('../../src/pages/api/admin/planner/action.ts', import.meta.url);
const middlewareUrl = new URL('../../src/middleware.ts', import.meta.url);
const layoutUrl = new URL('../../src/layouts/AdminLayout.astro', import.meta.url);
const detailUrl = new URL('../../src/pages/admin/planner/[id].astro', import.meta.url);

test('Admin Planner routes retain authentication, same-origin and accessible ordering contracts', async () => {
  const [api, middleware, layout, detail] = await Promise.all([
    readFile(apiUrl, 'utf8'), readFile(middlewareUrl, 'utf8'),
    readFile(layoutUrl, 'utf8'), readFile(detailUrl, 'utf8'),
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
});
