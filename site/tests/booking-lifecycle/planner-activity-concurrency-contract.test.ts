import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../', import.meta.url);

test('collaborative activity and stale-write recovery remain visible without exposing credentials', async () => {
  const [repository, bookerPage, participantPage, bookerApi, participantApi] = await Promise.all([
    readFile(new URL('src/lib/planner/repository.ts', root), 'utf8'),
    readFile(new URL('src/pages/booking/manage/[token]/planner/index.astro', root), 'utf8'),
    readFile(new URL('src/pages/planner/invite/[token].astro', root), 'utf8'),
    readFile(new URL('src/pages/api/booking/planner/[token].ts', root), 'utf8'),
    readFile(new URL('src/pages/api/planner/participant/[token].ts', root), 'utf8'),
  ]);
  assert.match(repository, /participant\.display_name/, 'activity must resolve invited participant identity');
  assert.match(repository, /owner\.display_name/, 'Booker activity must resolve the owner identity');
  for (const page of [bookerPage, participantPage]) {
    assert.match(page, /Recent activity/, 'authorized workspaces need visible recent activity');
    assert.match(page, /slice\(-10\)\.reverse\(\)/, 'recent activity must be bounded and newest first');
    assert.match(page, /data-planner-conflict/, 'stale writes need a visible conflict alert');
    assert.match(page, /Reload latest plan/, 'conflicts need an explicit keyboard-operable recovery');
  }
  assert.match(bookerPage, /data-planner-conflict/, 'Booker stale writes still need a visible conflict alert');
  assert.match(bookerPage, /Reload latest plan/, 'Booker conflicts still need explicit recovery');
  for (const api of [bookerApi, participantApi]) {
    assert.match(api, /currentRevision/, 'stale responses must identify the current server revision');
    assert.match(api, /revision conflict/, 'concurrency conflicts need structured diagnostics');
    assert.doesNotMatch(api, /revision conflict[^\n]*token/, 'conflict logs must not include private credentials');
  }
});
