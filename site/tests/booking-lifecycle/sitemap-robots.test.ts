import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { sitemapPaths, sitemapXml } from '../../src/lib/sitemap.ts';

const source = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const inventory = {
  pageIds: ['home', 'contact', 'guest-information'],
  listingSlugs: ['olrig-bank', 'event', 'cottage'],
  localGuideCategoryIds: ['home', 'walks'],
  localGuideEntrySlugs: ['kendal-castle'],
  holidayPlanSlugs: ['kendal-weekend'],
};

test('sitemap inventory includes canonical public pages once', () => {
  const paths = sitemapPaths(inventory);
  for (const path of [
    '/', '/book/', '/listings/', '/listings/olrig-bank/', '/listings/event/', '/listings/cottage/',
    '/local-guide/', '/local-guide/walks/', '/local-guide/kendal-castle/', '/holiday-plans/kendal-weekend/',
  ]) assert.equal(paths.filter((candidate) => candidate === path).length, 1, path);
});

test('sitemap inventory rejects unsafe or private-looking dynamic values', () => {
  const paths = sitemapPaths({
    ...inventory,
    pageIds: [...inventory.pageIds, 'admin/login', '../api'],
    listingSlugs: [...inventory.listingSlugs, 'main-house', 'booking/manage/token'],
    localGuideEntrySlugs: [...inventory.localGuideEntrySlugs, '<script>'],
  });
  assert.doesNotMatch(paths.join('\n'), /main-house|admin|api|booking|planner|script/);
});

test('sitemap XML contains absolute preferred HTTPS URLs and no duplicates', () => {
  const xml = sitemapXml(new URL('https://olrig-bank.com'), sitemapPaths(inventory));
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(xml, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.match(xml, /<loc>https:\/\/olrig-bank\.com\/listings\/olrig-bank\/<\/loc>/);
  assert.doesNotMatch(xml, /localhost|127\.0\.0\.1|192\.168\.|main-house/);
  const locations = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  assert.equal(new Set(locations).size, locations.length);
});

test('runtime endpoints declare correct formats, policies and dynamic sources', async () => {
  const [sitemap, robots] = await Promise.all([
    source('src/pages/sitemap.xml.ts'),
    source('src/pages/robots.txt.ts'),
  ]);
  assert.match(sitemap, /'Content-Type': 'application\/xml; charset=utf-8'/);
  assert.match(sitemap, /listPublishedLocalGuideCategories\(\)/);
  assert.match(sitemap, /getLocalGuideEntries\(\)/);
  assert.match(sitemap, /listPublishedExamplePlans\(\)/);
  assert.match(robots, /'Content-Type': 'text\/plain; charset=utf-8'/);
  assert.match(robots, /Disallow: \/admin\//);
  assert.match(robots, /Disallow: \/api\//);
  assert.match(robots, /Disallow: \/booking\//);
  assert.match(robots, /Disallow: \/planner\//);
  assert.match(robots, /\/sitemap\.xml/);
});
