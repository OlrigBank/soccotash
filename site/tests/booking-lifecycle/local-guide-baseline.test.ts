import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
test('retired Local Guide source is preserved completely in the migration baseline', async () => {
  const committed = JSON.parse(await readFile(new URL('../../src/data/local-guide-baseline.json', import.meta.url), 'utf8'));
  assert.equal(committed.entryCount, 39);
  assert.equal(committed.entries.length, committed.entryCount);
  assert.equal(new Set(committed.entries.map((entry: any) => entry.slug.toLowerCase())).size, committed.entryCount);
  assert.equal(committed.entries.every((entry: any) => entry.url === `/local-guide/${entry.slug}/`), true);
  assert.equal(committed.entries.every((entry: any) => /^[a-f0-9]{64}$/.test(entry.bodySha256)), true);
  assert.deepEqual(await readdir(new URL('../../src/content/local-guide', import.meta.url)).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  }), []);
});
