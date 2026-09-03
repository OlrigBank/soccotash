import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('discovery and content routes use the centred public content shell', async () => {
  const routes = await Promise.all([
    'src/pages/listings/index.astro',
    'src/pages/listings/[slug].astro',
    'src/pages/local-guide/index.astro',
    'src/pages/local-guide/[slug].astro',
    'src/pages/[slug].astro',
    'src/pages/404.astro',
  ].map(source));

  for (const route of routes) {
    assert.match(route, /showSidebar=\{false\}/);
    assert.match(route, /pageClass="public-content-page"/);
  }
});

test('the public content shell retains purposeful layouts and shared navigation', async () => {
  const [layout, listingDetail, localGuide] = await Promise.all([
    source('src/layouts/BaseLayout.astro'),
    source('src/pages/listings/[slug].astro'),
    source('src/pages/local-guide/index.astro'),
  ]);

  assert.match(layout, /pageClass = ''/);
  assert.match(layout, /'no-sidebar', pageClass/);
  assert.match(layout, /\.page-grid\.public-content-page/);
  assert.match(layout, /\.public-content-page \.hero h1/);
  assert.match(layout, />Check availability<\/a>/);
  assert.doesNotMatch(layout, />Book now<\/a>/);
  assert.match(listingDetail, /class:list=\{\["listing-opening"/);
  assert.match(listingDetail, /<CompactBookingPanel/);
  assert.match(localGuide, /<LocalGuideTree nodes=\{tree\}/);
});

test('booking and private workflow routes are not enrolled in the content-page treatment', async () => {
  const [booking, booker] = await Promise.all([
    source('src/pages/book.astro'),
    source('src/layouts/BookerLayout.astro'),
  ]);

  assert.doesNotMatch(booking, /public-content-page/);
  assert.doesNotMatch(booker, /public-content-page/);
});
