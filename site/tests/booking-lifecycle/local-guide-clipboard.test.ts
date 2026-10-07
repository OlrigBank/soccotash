import assert from 'node:assert/strict';
import test from 'node:test';
import { copyGuideEntryText, parseCopiedGuideEntry } from '../../src/lib/local-guide/clipboard.ts';

const entry = { title: 'Ruskins Bar', slug: 'ruskins', categoryId: 'music', imagePath: '/media/images/local-guide/ruskins.png', externalLink: 'https://example.test/', summary: 'A local bar.', markdownBody: '## Music\nLive music.', recommended: true };

test('clipboard round trip preserves content while omitting deployment identifiers', () => {
  const text = copyGuideEntryText({ ...entry, id: 'private-id', entryId: 'other-id', expectedVersion: 8 });
  const copied = parseCopiedGuideEntry(text)!;
  for (const [key, value] of Object.entries(entry)) assert.equal(copied[key as keyof typeof copied],value);
  assert.equal(text.includes('private-id'), false);
  assert.equal(text.includes('expectedVersion'), false);
});

test('unrelated, malformed, unsupported and oversized clipboard data is ignored', () => {
  for (const text of ['ordinary clipboard text','{}','null',JSON.stringify({kind:'olrig-bank-local-guide-entry',version:2,entry}),JSON.stringify({kind:'olrig-bank-local-guide-entry',version:1,entry:{...entry,imagePath:'javascript:alert(1)'}}),' '.repeat(140001)]) assert.equal(parseCopiedGuideEntry(text),null);
});
