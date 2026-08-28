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
  assert.match(homepage, /<CompactBookingPanel[\s\S]*source="homepage"[\s\S]*\/>/);
  assert.match(homepage, /id="ways-to-stay"/);
  assert.match(content, /heroTitle: "Stay at Olrig Bank in Kendal"/);
  assert.match(content, /Olrig Bank was built in 1879/);
  assert.match(content, /3 accomodation packages/);
});

test('the compact panel sits inside the hero before Ways to stay', async () => {
  const homepage = await source('src/pages/index.astro');
  const heroEnd = homepage.indexOf('</section>');
  const panel = homepage.indexOf('<CompactBookingPanel');
  const ways = homepage.indexOf('<section id="ways-to-stay"');
  assert.ok(panel >= 0 && heroEnd > panel && ways > heroEnd);
});

test('the homepage follows Quick Check with photographic discovery and focused decisions', async () => {
  const homepage = await source('src/pages/index.astro');

  assert.match(homepage, /<HomeGallery \/>/);
  assert.match(homepage, /<h2>Ways to stay at Olrig Bank<\/h2>[\s\S]*house\.jpeg[\s\S]*<Content \/>/);
  assert.doesNotMatch(homepage, /<ListingCard|<OfferingCard|Featured local guide/);
  assert.match(homepage, /kendalcastle\.png[\s\S]*Plan your stay[\s\S]*Our local guide/);
});

test('the suggested stay confirms availability without exposing quote details', async () => {
  const compactPanel = await source('src/components/CompactBookingPanel.astro');

  assert.match(compactPanel, /const suggestedStay = panel\.dataset\.autoSelectProperty === 'true'/);
  assert.match(compactPanel, /if \(!suggestedStay\) heading\.append\(total\)/);
  assert.match(compactPanel, /if \(body\.lines\?\.length && !suggestedStay\)/);
  assert.match(compactPanel, /if \(body\.estimatedPricing && !suggestedStay\)/);
});

test('the homepage hero preserves responsive crop and contrast contracts', async () => {
  const homepage = await source('src/pages/index.astro');

  assert.match(homepage, /aspect-ratio:\s*16 \/ 9/);
  assert.match(homepage, /object-fit:\s*cover/);
  assert.match(homepage, /\.home-hero::after[\s\S]*linear-gradient/);
  assert.match(homepage, /@media \(min-width: 700px\)/);
});
