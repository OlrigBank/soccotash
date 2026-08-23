import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { isNoIndex, normalisePublicPath, productionAssetUrl, productionUrl } from '../../src/lib/public-metadata.ts';

const productionSite = new URL('https://olrig-bank.com');
const source = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('canonical URLs use the configured production origin and normalized path only', () => {
  assert.equal(
    productionUrl(productionSite, '/listings/olrig-bank/?utm_source=local#details').href,
    'https://olrig-bank.com/listings/olrig-bank/',
  );
  assert.equal(productionUrl(productionSite, '//listings/olrig-bank').href, 'https://olrig-bank.com/listings/olrig-bank/');
  assert.equal(normalisePublicPath('/'), '/');
  assert.doesNotMatch(productionUrl(productionSite, '/contact/').href, /localhost|127\.0\.0\.1|192\.168\./);
});

test('Astro and public site settings use the preferred production domain', async () => {
  const [config, settings] = await Promise.all([
    source('astro.config.mjs'),
    source('src/data/settings/site.yml'),
  ]);
  assert.match(config, /site: 'https:\/\/olrig-bank\.com'/);
  assert.match(config, /hostname: 'olrig-bank\.com'/);
  assert.match(settings, /url: "https:\/\/olrig-bank\.com"/);
});

test('social image URLs are absolute HTTPS production URLs', () => {
  assert.equal(
    productionAssetUrl(productionSite, '/media/images/listings/house.jpeg').href,
    'https://olrig-bank.com/media/images/listings/house.jpeg',
  );
});

test('noindex recognition is case-insensitive and directive based', () => {
  assert.equal(isNoIndex('noindex,nofollow,noarchive'), true);
  assert.equal(isNoIndex('NOINDEX, FOLLOW'), true);
  assert.equal(isNoIndex('index,follow'), false);
});

test('BaseLayout emits public canonical and social tags only for indexable pages', async () => {
  const layout = await source('src/layouts/BaseLayout.astro');

  assert.match(layout, /indexable && <link rel="canonical" href=\{canonicalUrl\}/);
  for (const property of ['og:type', 'og:title', 'og:description', 'og:url', 'og:image', 'og:image:alt']) {
    assert.match(layout, new RegExp(`property="${property}"`));
  }
  for (const name of ['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image', 'twitter:image:alt']) {
    assert.match(layout, new RegExp(`name="${name}"`));
  }
  assert.doesNotMatch(layout, /Astro\.request\.headers|get\(['"]host['"]\)|x-forwarded-host/i);
});

test('listing pages provide their selected image and accessible alternative text', async () => {
  const listing = await source('src/pages/listings/[slug].astro');
  assert.match(listing, /socialImage=\{entry\.data\.image\}/);
  assert.match(listing, /socialImageAlt=\{entry\.data\.imageAlt \?\? entry\.data\.title\}/);
});

test('the retired Main House URL permanently redirects to the preferred Olrig Bank URL', async () => {
  const redirect = await source('src/pages/listings/main-house.astro');
  assert.match(redirect, /Astro\.redirect\('\/listings\/olrig-bank\/', 301\)/);
});
