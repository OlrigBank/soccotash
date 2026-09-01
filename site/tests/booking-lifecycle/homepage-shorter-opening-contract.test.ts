import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Ways to stay follows the hero and precedes photographic discovery', async () => {
  const homepage = await source('src/pages/index.astro');
  const heroEnd = homepage.indexOf('</section>');
  const waysStart = homepage.indexOf('<section id="ways-to-stay"');
  const waysEnd = homepage.indexOf('</section>', waysStart);
  const galleryStart = homepage.indexOf('<HomeGallery />');

  assert.ok(heroEnd >= 0 && waysStart > heroEnd, 'Ways to stay must follow the hero and compact panel');
  assert.match(homepage.slice(0, heroEnd), /CompactBookingPanel/);
  assert.ok(galleryStart > waysEnd, 'photographic discovery must follow Ways to stay');
  assert.doesNotMatch(homepage.slice(heroEnd, waysStart), /class="prose"/);
  assert.match(homepage, /class="ways-to-stay__intro"/);
  assert.doesNotMatch(homepage.slice(waysStart, waysEnd), /<img/);
  assert.doesNotMatch(homepage, /places-grid/);
});

test('the semantic comparison retains three standard choices, Bespoke and a route to Jenna', async () => {
  const homepage = await source('src/pages/index.astro');

  assert.match(homepage, /<table>[\s\S]*<caption>Compare stays at Olrig Bank<\/caption>/);
  assert.match(homepage, /<th scope="col">Stay<\/th>/);
  for (const label of ['Guests', 'Bedrooms', 'Bathrooms', 'Price/night']) {
    assert.match(
      homepage,
      new RegExp(`<th scope="col">[\\s\\S]*?<svg aria-hidden="true"[\\s\\S]*?<span>${label}<\\/span>[\\s\\S]*?<\\/th>`),
    );
  }
  assert.match(homepage, /<th scope="row"><a href="\/listings\/olrig-bank\/">Olrig Bank<\/a><\/th>\s*<td>8<\/td>\s*<td>4<\/td>\s*<td>2<\/td>/);
  assert.match(homepage, /<th scope="row"><a href="\/listings\/event\/">Olrig Bank\+\+<\/a><\/th>\s*<td>12<\/td>\s*<td>6<\/td>\s*<td>3<\/td>/);
  assert.match(homepage, /<th scope="row"><a href="\/listings\/cottage\/">Cottage at Olrig Bank<\/a><\/th>\s*<td>4<\/td>\s*<td>2<\/td>\s*<td>1<\/td>/);
  assert.doesNotMatch(homepage, /separate WC/);
  assert.doesNotMatch(homepage, /Swipe sideways to compare all stays\./);
  assert.match(homepage, /href="\/listings\/bespoke\/">Olrig Bank Bespoke<\/a>/);
  assert.match(homepage, /href="\/contact\/">ask Jenna to help you choose<\/a>/);
});

test('the comparison scrolls within its region at narrow widths', async () => {
  const homepage = await source('src/pages/index.astro');

  assert.match(homepage, /class="ways-to-stay__table-scroll"[\s\S]*role="region"[\s\S]*tabindex="0"/);
  assert.match(homepage, /\.ways-to-stay__table-scroll\s*\{[\s\S]*overflow-x:\s*auto/);
  assert.match(homepage, /\.ways-to-stay table\s*\{[\s\S]*min-width:\s*36rem/);
  assert.match(homepage, /:is\(thead th:first-child, tbody th\)[\s\S]*position:\s*sticky[\s\S]*left:\s*0/);
  assert.match(homepage, /\.ways-to-stay caption\s*\{[\s\S]*position:\s*absolute[\s\S]*clip:\s*rect/);
});
