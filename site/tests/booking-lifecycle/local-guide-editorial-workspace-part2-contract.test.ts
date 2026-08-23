import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('candidate website URLs survive Local Guide moderation and promotion', async () => {
  const [migration, repository, types, api, page] = await Promise.all([
    source('db/045_local_guide_candidate_source_urls.sql'),
    source('src/lib/planner/repository.ts'),
    source('src/lib/planner/types.ts'),
    source('src/pages/api/admin/planner/contributions.ts'),
    source('src/pages/admin/local-guide/index.astro'),
  ]);
  assert.match(migration, /offered_source_url TEXT/);
  assert.match(migration, /reviewed_source_url TEXT/);
  assert.match(migration, /plan_candidate_activities candidate[\s\S]*candidate\.source_url/);
  assert.match(migration, /plan_items item[\s\S]*item\.source_url/);
  assert.match(repository, /offered_description,offered_source_url/);
  assert.match(repository, /external_link,actor_type[\s\S]*reviewedSourceUrl/);
  assert.match(repository, /reviewedSourceUrl\?\?base\.external_link/);
  assert.match(types, /offeredSourceUrl: string \| null/);
  assert.match(types, /reviewedSourceUrl: string \| null/);
  assert.match(api, /reviewedSourceUrl:nullable\(input\.reviewedSourceUrl\)/);
  assert.match(page, /name="reviewedSourceUrl" type="url"/);
  assert.match(page, /reviewedSourceUrl\.value=candidate\.offeredSourceUrl\?\?''/);
});

test('workspace Close controls bypass validation but Save and decisions do not', async () => {
  const page = await source('src/pages/admin/local-guide/index.astro');
  const closeButtons = page.match(/class="booking-drawer-close"[^>]+>/g) ?? [];
  assert.equal(closeButtons.length, 3);
  for (const button of closeButtons) assert.match(button, /formnovalidate/);
  assert.doesNotMatch(page, /class="admin-button" value="save"[^>]*formnovalidate/);
  assert.doesNotMatch(page, /value="accept"[^>]*formnovalidate/);
  assert.doesNotMatch(page, /value="reject"[^>]*formnovalidate/);
});
