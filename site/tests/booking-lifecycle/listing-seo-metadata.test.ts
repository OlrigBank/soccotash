import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const source = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

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

  assert.match(olrigBank, /title: "Olrig Bank"/);
  assert.match(olrigBank, /slug: "olrig-bank"/);
  assert.match(olrigBank, /sleeps: "Sleeps 8 adults"/);
  assert.match(olrigBank, /bedrooms: "4 bedrooms"/);
  assert.match(olrigBank, /bathrooms: "2 bathrooms"/);
  assert.doesNotMatch(olrigBank, /Main House/);

  assert.match(combined, /title: "Olrig Bank Max"/);
  assert.match(combined, /sleeps: "Sleeps 12 adults"/);
  assert.match(combined, /bedrooms: "6 bedrooms"/);
  assert.match(combined, /bathrooms: "3 bathrooms & 1 WC"/);
  const combinedDescription = combined.split('---').at(-1) ?? '';
  assert.doesNotMatch(combinedDescription, /\bCottage\b|\bcottage\b/);
  assert.match(combined, /Olrig Bank Max sleeps 12 adults in six bedrooms/);

  assert.match(cottage, /title: "The Cottage at Olrig Bank"/);
  assert.match(cottage, /bedrooms: "2 bedrooms"/);
  assert.match(cottage, /bathrooms: "1 bathroom plus a separate WC"/);
});
