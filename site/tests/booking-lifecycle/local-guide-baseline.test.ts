import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildLocalGuideBaseline } from '../../scripts/generate-local-guide-baseline.ts';

const siteRoot = new URL('../../', import.meta.url).pathname;

test('Local Guide baseline accounts for every current source entry', async () => {
  const generated = await buildLocalGuideBaseline(siteRoot);
  const committed = JSON.parse(await readFile(new URL('../../src/data/local-guide-baseline.json', import.meta.url), 'utf8'));
  assert.deepEqual(generated, committed);
  assert.equal(generated.entryCount, 39);
  assert.equal(generated.entries.length, generated.entryCount);
  assert.equal(new Set(generated.entries.map((entry) => entry.slug.toLowerCase())).size, generated.entryCount);
  assert.equal(generated.entries.every((entry) => entry.url === `/local-guide/${entry.slug}/`), true);
  assert.equal(generated.entries.every((entry) => /^[a-f0-9]{64}$/.test(entry.bodySha256)), true);
});

