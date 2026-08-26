import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const adminLayoutUrl = new URL('../../src/layouts/AdminLayout.astro', import.meta.url);
const baseLayoutUrl = new URL('../../src/layouts/BaseLayout.astro', import.meta.url);
const stylesUrl = new URL('../../src/styles/global.css', import.meta.url);

test('shared layouts retain the phone navigation and viewport contracts', async () => {
  const [adminLayout, baseLayout, styles] = await Promise.all([
    readFile(adminLayoutUrl, 'utf8'),
    readFile(baseLayoutUrl, 'utf8'),
    readFile(stylesUrl, 'utf8'),
  ]);

  assert.match(adminLayout, /viewport-fit=cover/, 'admin pages must support phone safe areas');
  assert.match(adminLayout, /class="admin-mobile-menu"/, 'admin pages need a compact phone menu');
  assert.match(adminLayout, /aria-label="Mobile administration navigation"/, 'the phone menu needs an accessible navigation landmark');
  assert.match(baseLayout, /viewport-fit=cover/, 'public pages must support phone safe areas');
  assert.match(baseLayout, /\.site-header[\s\S]*contain: inline-size/, 'the public header must not widen the page to its navigation content');
  assert.match(baseLayout, /class="mobile-header-actions"/, 'the public header needs compact phone actions');
  assert.match(baseLayout, /class="mobile-request-link" href="\/book\/"/, 'the request action must remain visible outside the phone menu');
  assert.match(baseLayout, /class="mobile-site-menu"[\s\S]*<summary>Menu<\/summary>/, 'the phone navigation must use a native disclosure');
  assert.match(baseLayout, /aria-label="Mobile navigation"/, 'the public phone menu needs an accessible navigation landmark');
  assert.match(baseLayout, /\.mobile-request-link,[\s\S]*min-height:\s*44px/, 'phone header controls must retain touch-sized targets');
  assert.match(baseLayout, /\.desktop-top-nav\s*{[\s\S]*display:\s*none/, 'desktop navigation must not duplicate the phone navigation');
  assert.match(baseLayout, /@media \(min-width: 820px\)[\s\S]*\.mobile-header-actions[\s\S]*display:\s*none/, 'phone actions must yield to desktop navigation');
  assert.doesNotMatch(baseLayout, /overflow-x:\s*auto/, 'the public navigation must not rely on horizontal scrolling');
  assert.match(styles, /\.admin-mobile-menu[\s\S]*display: none/, 'the phone menu must not duplicate desktop navigation');
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*\.admin-sidebar[\s\S]*display: none/, 'the desktop sidebar must yield to the phone menu');
  assert.match(styles, /font-size: 16px/, 'phone form fields must avoid automatic browser zoom');
  assert.match(styles, /env\(safe-area-inset-bottom\)/, 'fixed and page content must clear phone safe areas');
  assert.match(styles, /-webkit-overflow-scrolling: touch/, 'wide data surfaces must scroll naturally on touch devices');
  assert.match(styles, /\.planner-form[\s\S]*grid-template-columns: minmax\(0, 1fr\)/, 'planner forms must collapse to one column');
});

test('public mobile navigation keeps all top-level destinations crawlable', async () => {
  const baseLayout = await readFile(baseLayoutUrl, 'utf8');
  const mobileMenu = baseLayout.match(/<details class="mobile-site-menu">([\s\S]*?)<\/details>/)?.[1] ?? '';

  assert.match(mobileMenu, /href="\/"/);
  assert.match(mobileMenu, /href="\/listings\/"/);
  assert.match(mobileMenu, /href="\/guest-information\/"/);
  assert.match(mobileMenu, /href="\/local-guide\/"/);
  assert.match(mobileMenu, /href="\/contact\/"/);
});

test('public responsive shell uses repaint-safe horizontal overflow', async () => {
  const baseLayout = await readFile(baseLayoutUrl, 'utf8');

  assert.match(baseLayout, /body\s*{[^}]*overflow-x:\s*hidden/, 'the page must contain horizontal overflow without Chromium clip repaint failures');
  assert.match(baseLayout, /\.mobile-first-shell\s*{[^}]*overflow-x:\s*hidden/, 'the responsive shell must retain repaint-safe horizontal overflow');
  assert.doesNotMatch(baseLayout, /(?:body|\.mobile-first-shell)\s*{[^}]*overflow-x:\s*clip/, 'the public shell must not reintroduce the resize-dependent Chromium repaint failure');
});
