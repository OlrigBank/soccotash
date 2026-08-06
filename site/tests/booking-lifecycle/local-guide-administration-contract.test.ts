import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Local Guide administration uses protected lifecycle actions and optimistic concurrency', async () => {
  const api=await readFile(new URL('../../src/pages/api/admin/local-guide/action.ts',import.meta.url),'utf8');
  const list=await readFile(new URL('../../src/pages/admin/local-guide/index.astro',import.meta.url),'utf8');
  const editor=await readFile(new URL('../../src/pages/admin/local-guide/[id].astro',import.meta.url),'utf8');
  assert.match(api,/isSameOrigin\(request\)/);
  assert.match(api,/locals\.adminUser/);
  assert.match(api,/STALE_VERSION/);
  for(const action of ['create','edit','publish','unpublish','archive','slug','restore']) assert.match(api,new RegExp(`case '${action}'`));
  assert.match(list,/name="status"/); assert.match(list,/name="category"/);
  assert.match(editor,/renderSafeLocalGuideMarkdown/);
  assert.match(editor,/Public entry preview/);
  assert.match(editor,/No additional body content/);
  assert.match(editor,/workingRevisionId!==entry\.publishedRevisionId/);
  assert.match(editor,/working revision contains unpublished changes/);
  assert.match(editor,/Publish working revision/);
  assert.match(editor,/Unpublish current entry/);
  assert.match(editor,/Archived entries are read-only/);
  assert.match(editor,/Restore as new revision/);
  assert.match(editor,/Current version:.*Reload to recover/);
});
