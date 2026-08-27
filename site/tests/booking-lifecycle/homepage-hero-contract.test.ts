import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';

const source = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const heroAssetUrl = new URL('../../public/media/images/spaces/house/View of front of house-no-cyclists-hero.jpg', import.meta.url);

test('the homepage uses the approved image-led hero without competing actions', async () => {
  const [homepage, content, asset] = await Promise.all([
    source('src/pages/index.astro'),
    source('src/content/pages/home.md'),
    stat(heroAssetUrl),
  ]);

  assert.ok(asset.size > 0, 'the approved hero asset must be present');
  assert.match(homepage, /class="home-hero"/);
  assert.match(homepage, /View of front of house-no-cyclists-hero\.jpg/);
  assert.match(homepage, /width="1448"/);
  assert.match(homepage, /height="814"/);
  assert.match(homepage, /loading="eager"/);
  assert.match(homepage, /fetchpriority="high"/);
  const hero = homepage.match(/<section class="home-hero">([\s\S]*?)<\/section>/)?.[1] ?? '';
  assert.doesNotMatch(hero, /Request a stay|View ways to stay|class="button/);
  assert.match(homepage, /<CompactBookingPanel source="homepage" \/>/);
  assert.match(homepage, /id="ways-to-stay"/);
  assert.match(content, /heroTitle: "Stay together at Olrig Bank in Kendal"/);
  assert.match(content, /secluded in the heart of Kendal with all that the town has to offer in walking distance/);
  assert.match(content, /Olrig Bank has 6 bedrooms, 3 bathrooms, a large garden and free off road parking space/);
});

test('the compact panel replaces the hero actions before Ways to stay', async () => {
  const homepage = await source('src/pages/index.astro');
  const heroEnd = homepage.indexOf('</section>');
  const panel = homepage.indexOf('<CompactBookingPanel source="homepage" />');
  const ways = homepage.indexOf('<section id="ways-to-stay"');
  assert.ok(heroEnd >= 0 && panel > heroEnd && ways > panel);
});

test('the homepage hero preserves responsive crop and contrast contracts', async () => {
  const homepage = await source('src/pages/index.astro');

  assert.match(homepage, /aspect-ratio:\s*16 \/ 9/);
  assert.match(homepage, /object-fit:\s*cover/);
  assert.match(homepage, /\.home-hero::after[\s\S]*linear-gradient/);
  assert.match(homepage, /@media \(min-width: 700px\)/);
});
