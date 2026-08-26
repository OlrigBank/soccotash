import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Ways to stay follows the hero without a standalone prose panel', async () => {
  const homepage = await source('src/pages/index.astro');
  const heroEnd = homepage.indexOf('</section>');
  const waysStart = homepage.indexOf('<section id="ways-to-stay"');

  assert.ok(heroEnd >= 0 && waysStart > heroEnd, 'Ways to stay must follow the hero');
  assert.doesNotMatch(homepage.slice(heroEnd, waysStart), /class="prose"/);
  assert.match(homepage, /class="ways-to-stay__intro"/);
  assert.match(homepage, /<h2>Ways to stay<\/h2>[\s\S]*<Content \/>[\s\S]*places-grid/);
});

test('the shorter orientation retains four choices and a route to Jenna', async () => {
  const content = await source('src/content/pages/home.md');

  assert.match(content, /\[Olrig Bank, our large group and family holiday house in Kendal\]\(\/listings\/olrig-bank\/\)/);
  assert.match(content, /\[The Cottage at Olrig Bank for an independent stay\]\(\/listings\/cottage\/\)/);
  assert.match(content, /\[Olrig Bank Max for up to 12 adults\]\(\/listings\/event\/\)/);
  assert.match(content, /\[Olrig Bank Bespoke[^\]]*\]\(\/listings\/bespoke\/\)/);
  assert.match(content, /\[Ask Jenna for help choosing your stay\]\(\/contact\/\)/);

  const body = content.split('---').at(-1)?.trim() ?? '';
  assert.equal(body.split(/(?<=[.!?])\s+/).length, 2, 'the orientation should remain two sentences');
});
