import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';

const source = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const heroAssetUrl = new URL('../../public/media/images/listings/house.jpeg', import.meta.url);

test('the homepage uses the approved image-led hero without competing actions', async () => {
  const [homepage, content, asset] = await Promise.all([
    source('src/pages/index.astro'),
    source('src/content/pages/home.md'),
    stat(heroAssetUrl),
  ]);

  assert.ok(asset.size > 0, 'the approved hero asset must be present');
  assert.match(homepage, /class="home-hero"/);
  assert.match(homepage, /src="\/media\/images\/listings\/house\.jpeg"/);
  assert.match(homepage, /width="1440"/);
  assert.match(homepage, /height="1085"/);
  assert.match(homepage, /loading="eager"/);
  assert.match(homepage, /fetchpriority="high"/);
  const hero = homepage.match(/<section class="home-hero">([\s\S]*?)<\/section>/)?.[1] ?? '';
  assert.doesNotMatch(hero, /Request a stay|View ways to stay|class="button/);
  assert.match(homepage, /<CompactBookingPanel[\s\S]*source="homepage"[\s\S]*\/>/);
  assert.match(homepage, /heading=""/);
  assert.match(homepage, /submitLabel="Quick Check"/);
  assert.match(homepage, /id="ways-to-stay"/);
  assert.match(content, /heroTitle: "Olrig Bank"/);
  assert.match(content, /heroFacts: "Sleeps up to 12 \| 6 bedrooms \| Dog-friendly \| Ideal for large groups"/);
  assert.match(content, /heroText: "Built in 1879 as a family home for George MacKay, a Mayor of Kendal and owner of the nearby Aynam Mills\. Today, this secluded house and its large garden provide guests with a comfortable base from which to explore Kendal on foot, with easy access to everything the beautiful Lake District and Cumbrian peninsulas have to offer\."/);
  assert.match(homepage, /class="home-hero__facts">\{page\.data\.heroFacts\}<\/p>/);
  assert.doesNotMatch(content, /Choose your dates and tell us who is coming/);
  assert.doesNotMatch(content, /waysToStayIntro:/);
  assert.match(content, /waysToStayGroupFit: "Olrig Bank is best used by medium or large groups of guests/);
  assert.doesNotMatch(content, /availibil|availble|accomodation|suites you/i);
});

test('the compact panel sits inside the hero before Ways to stay', async () => {
  const homepage = await source('src/pages/index.astro');
  const heroEnd = homepage.indexOf('</section>');
  const panel = homepage.indexOf('<CompactBookingPanel');
  const ways = homepage.indexOf('<section id="ways-to-stay"');
  assert.ok(panel >= 0 && heroEnd > panel && ways > heroEnd);
});

test('the homepage follows Quick Check with stay comparison then photographic discovery', async () => {
  const homepage = await source('src/pages/index.astro');

  assert.match(homepage, /<HomeGallery \/>/);
  const ways = homepage.indexOf('<section id="ways-to-stay"');
  const gallery = homepage.indexOf('<HomeGallery />');
  assert.ok(ways >= 0 && gallery > ways, 'Ways to stay must precede photographic discovery');
  assert.match(homepage, /<h2>Choosing your stay<\/h2>[\s\S]*<table>/);
  assert.doesNotMatch(homepage, /<ListingCard|<OfferingCard|Featured local guide/);
  assert.match(homepage, /kendalcastle\.png[\s\S]*Plan your stay[\s\S]*Our local guide/);
});

test('the suggested stay confirms availability without exposing quote details', async () => {
  const compactPanel = await source('src/components/CompactBookingPanel.astro');

  assert.match(compactPanel, /const suggestedStay = panel\.dataset\.autoSelectProperty === 'true'/);
  assert.match(compactPanel, /if \(!suggestedStay\) heading\.append\(total\)/);
  assert.match(compactPanel, /if \(body\.lines\?\.length && !suggestedStay\)/);
  assert.match(compactPanel, /if \(body\.estimatedPricing && !suggestedStay\)/);
  assert.doesNotMatch(compactPanel, /Suggested stay arrangement/);
  assert.match(compactPanel, /\.sort\(\(a, b\) => a\.maximumGuests - b\.maximumGuests\)/);
  assert.match(compactPanel, /for \(const candidate of candidates\)/);
  assert.match(compactPanel, /continueLink\('Reserve'\)/);
  assert.match(compactPanel, /price\.append\(total, ' total'\)/);
  assert.match(compactPanel, /stay\.textContent = recommendation\?\.dataset\.name/);
  assert.match(compactPanel, /result\.append\(price, stay, continueLink\('Reserve'\), reassurance\)/);
  assert.match(compactPanel, /if \(action\) action\.hidden = true/);
  assert.match(compactPanel, /if \(suggestedStay && body\.estimatedPricing\)/);
  assert.match(compactPanel, /renderSuggestedResult\([\s\S]*body\.estimatedPricing\.guestTotalPence/);
  assert.match(compactPanel, /You won't be charged yet/);
  assert.match(compactPanel, /Those dates are unavailable\. Please choose different dates\./);
  assert.match(compactPanel, /String\(date\.getUTCDate\(\)\)\.padStart\(2, '0'\)/);
});

test('the homepage hero preserves responsive crop and contrast contracts', async () => {
  const homepage = await source('src/pages/index.astro');

  assert.match(homepage, /aspect-ratio:\s*16 \/ 9/);
  assert.match(homepage, /object-fit:\s*cover/);
  assert.match(homepage, /object-position:\s*center 46%/);
  assert.match(homepage, /\.home-hero::after[\s\S]*linear-gradient/);
  assert.match(homepage, /@media \(min-width: 700px\)/);
});
