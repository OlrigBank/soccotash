import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import YAML from 'yaml';

const source = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

function listingData(markdown: string): Record<string, unknown> {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  assert.ok(match, 'Listing must begin with YAML front matter.');
  return YAML.parse(match[1]) as Record<string, unknown>;
}

test('listing content supports server-rendered SEO and presentation metadata', async () => {
  const [schema, route, layout] = await Promise.all([
    source('src/content.config.ts'),
    source('src/pages/listings/[slug].astro'),
    source('src/layouts/BaseLayout.astro'),
  ]);

  for (const field of ['seoTitle', 'description', 'heroEyebrow', 'heroTitle']) {
    assert.match(schema, new RegExp(`${field}: z\\.string\\(\\)\\.max\\(\\d+\\)\\.optional\\(\\)`));
  }
  assert.match(route, /title=\{entry\.data\.seoTitle \?\? entry\.data\.title\}/);
  assert.match(route, /description=\{entry\.data\.description \?\? entry\.data\.summary\}/);
  assert.match(route, /entry\.data\.heroTitle \?\? entry\.data\.title/);
  assert.match(layout, /title\.includes\('Olrig Bank'\) \? title : `\$\{title\} \| Olrig Bank`/);
});

test('public listing facts and labels follow the agreed accommodation model', async () => {
  const [olrigBank, combined, cottage] = await Promise.all([
    source('src/content/listings/main-house.md'),
    source('src/content/listings/event.md'),
    source('src/content/listings/cottage.md'),
  ]);
  const olrigBankData = listingData(olrigBank);
  const combinedData = listingData(combined);
  const cottageData = listingData(cottage);

  assert.equal(olrigBankData.title, 'Olrig Bank');
  assert.equal(olrigBankData.slug, 'olrig-bank');
  assert.equal(olrigBankData.sleeps, 'Sleeps 8 adults');
  assert.equal(olrigBankData.bedrooms, '4 bedrooms');
  assert.equal(olrigBankData.bathrooms, '2 bathrooms');
  assert.doesNotMatch(olrigBank, /Main House/);

  assert.equal(combinedData.title, 'Olrig Bank Max');
  assert.equal(combinedData.sleeps, 'Sleeps 12 adults');
  assert.equal(combinedData.bedrooms, '6 bedrooms');
  assert.equal(combinedData.bathrooms, '3 bathrooms & 1 WC');
  const combinedDescription = combined.split('---').at(-1) ?? '';
  assert.doesNotMatch(combinedDescription, /\bCottage\b|\bcottage\b/);
  assert.match(combined, /Olrig Bank Max sleeps 12 adults in six bedrooms/);

  assert.equal(cottageData.title, 'The Cottage at Olrig Bank');
  assert.equal(cottageData.bedrooms, '2 bedrooms');
  assert.equal(cottageData.bathrooms, '1 bathroom plus a separate WC');
});

test('listing fact validation accepts Pages CMS YAML formatting', () => {
  const data = listingData(`---
title: Olrig Bank Max
sleeps: Sleeps 12 adults
bedrooms: 6 bedrooms
bathrooms: 3 bathrooms & 1 WC
---
Description.
`);
  assert.deepEqual(data, {
    title: 'Olrig Bank Max',
    sleeps: 'Sleeps 12 adults',
    bedrooms: '6 bedrooms',
    bathrooms: '3 bathrooms & 1 WC',
  });
});
