import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const source = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const listingPaths = ['/listings/olrig-bank/', '/listings/event/', '/listings/cottage/'];

test('the home page contains descriptive standard links to every accommodation', async () => {
  const home = await source('src/content/pages/home.md');

  for (const path of listingPaths) assert.match(home, new RegExp(`\\]\\(${path}\\)`));
  assert.match(home, /large group and family holiday house in Kendal/);
  assert.match(home, /Olrig Bank Max for up to 12 adults/);
  assert.match(home, /The Cottage at Olrig Bank for an independent stay/);
});

test('public supporting pages provide crawlable contextual listing links', async () => {
  const [guestInformation, contact, localGuide] = await Promise.all([
    source('src/content/pages/guest-information.md'),
    source('src/content/pages/contact.md'),
    source('src/pages/local-guide/index.astro'),
  ]);

  for (const path of listingPaths) {
    assert.match(guestInformation, new RegExp(`\\]\\(${path}\\)`));
    assert.match(contact, new RegExp(`\\]\\(${path}\\)`));
    assert.match(localGuide, new RegExp(`href="${path}"`));
  }
  const publicLinks = [
    ...`${guestInformation}\n${contact}`.matchAll(/\]\((\/[^)]+)\)/g),
    ...localGuide.matchAll(/href="(\/[^"{]+)"/g),
  ].map((match) => match[1]);
  assert.doesNotMatch(publicLinks.join('\n'), /\/admin\/|\/booking\/manage\/|\/planner\//);
});

test('desktop and mobile navigation share the public listings destination', async () => {
  const [layout, sideMenu] = await Promise.all([
    source('src/layouts/BaseLayout.astro'),
    source('src/components/SideMenu.astro'),
  ]);

  assert.match(layout, /class="top-nav[^"]*"[\s\S]*href="\/listings\/"/);
  assert.match(layout, /class="mobile-menu"[\s\S]*<SideMenu/);
  assert.match(sideMenu, /href="\/listings\/"/);
});
