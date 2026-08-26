import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';

const source = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const heroAssetUrl = new URL('../../public/media/images/spaces/house/View of front of house-no-cyclists-hero.jpg', import.meta.url);

test('the homepage uses the approved image-led hero and crawlable actions', async () => {
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
  assert.match(homepage, /href="\/book\/">Request a stay<\/a>/);
  assert.match(homepage, /href="#ways-to-stay">View ways to stay<\/a>/);
  assert.match(homepage, /id="ways-to-stay"/);
  assert.match(content, /heroTitle: "Stay together at Olrig Bank in Kendal"/);
  assert.match(content, /within walking distance of Kendal and easy reach of the Lake District/);
});

test('the homepage hero preserves responsive crop and contrast contracts', async () => {
  const homepage = await source('src/pages/index.astro');

  assert.match(homepage, /aspect-ratio:\s*16 \/ 9/);
  assert.match(homepage, /object-fit:\s*cover/);
  assert.match(homepage, /\.home-hero::after[\s\S]*linear-gradient/);
  assert.match(homepage, /@media \(min-width: 700px\)/);
  assert.match(homepage, /@media \(max-width: 430px\)/);
});
