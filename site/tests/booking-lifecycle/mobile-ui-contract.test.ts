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
  assert.match(baseLayout, /class="brand-logo"[\s\S]*olrig-bank-header-logo\.png/, 'the public header must use the Olrig Bank Kendal artwork');
  assert.match(baseLayout, /class="brand" aria-label="Olrig Bank home"/, 'the image brand must retain an accessible home label');
  assert.match(baseLayout, /\.mobile-first-shell > \.site-header\s*{[^}]*background:\s*var\(--soft-accent\)/, 'the public header panel must use the light green theme colour');
  assert.match(baseLayout, /\.site-header[\s\S]*contain: inline-size/, 'the public header must not widen the page to its navigation content');
  assert.match(baseLayout, /class="mobile-header-actions"/, 'the public header needs a compact menu action');
  assert.doesNotMatch(baseLayout, /class="mobile-request-link"/, 'the header must not retain a separate request action');
  assert.match(baseLayout, /class="mobile-site-menu"[\s\S]*<summary><span aria-hidden="true">☰<\/span><span>Menu<\/span><\/summary>/, 'public navigation must use a visibly labelled native disclosure');
  assert.match(baseLayout, /aria-label="Public navigation"/, 'the public menu needs an accessible navigation landmark');
  assert.match(baseLayout, /\.mobile-site-menu > summary\s*{[\s\S]*min-height:\s*44px/, 'the menu control must retain a touch-sized target');
  assert.doesNotMatch(baseLayout, /class="top-nav desktop-top-nav"/, 'desktop must not reintroduce a competing navigation row');
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
  assert.match(mobileMenu, /href="\/book\/"/);
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
