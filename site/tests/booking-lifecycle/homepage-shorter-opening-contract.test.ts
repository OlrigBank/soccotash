import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('photographic discovery and Ways to stay follow the hero without a standalone prose panel', async () => {
  const homepage = await source('src/pages/index.astro');
  const heroEnd = homepage.indexOf('</section>');
  const waysStart = homepage.indexOf('<section id="ways-to-stay"');

  assert.ok(heroEnd >= 0 && waysStart > heroEnd, 'Ways to stay must follow the hero and compact panel');
  assert.match(homepage.slice(0, heroEnd), /CompactBookingPanel/);
  assert.match(homepage.slice(heroEnd, waysStart), /HomeGallery/);
  assert.doesNotMatch(homepage.slice(heroEnd, waysStart), /class="prose"/);
  assert.match(homepage, /class="ways-to-stay__intro"/);
  assert.match(homepage, /<h2>Ways to stay at Olrig Bank<\/h2>[\s\S]*class="ways-to-stay__image"[\s\S]*<Content \/>/);
  assert.doesNotMatch(homepage, /places-grid/);
});

test('the orientation retains three standard choices, Bespoke and a route to Jenna', async () => {
  const content = await source('src/content/pages/home.md');

  assert.match(content, /\[Olrig Bank\]\(\/listings\/olrig-bank\/\)/);
  assert.match(content, /\[The Cottage at Olrig Bank\]\(\/listings\/cottage\/\)/);
  assert.match(content, /\[Olrig Bank Max\]\(\/listings\/event\/\)/);
  assert.match(content, /\[Olrig Bank Bespoke[^\]]*\]\(\/listings\/bespoke\/\)/);
  assert.match(content, /\[Ask Jenna to help you choose\]\(\/contact\/\)/);
});
