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
  assert.match(baseLayout, /\.mobile-first-top-nav[\s\S]*min-width: 0/, 'the public navigation must shrink to the phone viewport');
  assert.match(styles, /\.admin-mobile-menu[\s\S]*display: none/, 'the phone menu must not duplicate desktop navigation');
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*\.admin-sidebar[\s\S]*display: none/, 'the desktop sidebar must yield to the phone menu');
  assert.match(styles, /font-size: 16px/, 'phone form fields must avoid automatic browser zoom');
  assert.match(styles, /env\(safe-area-inset-bottom\)/, 'fixed and page content must clear phone safe areas');
  assert.match(styles, /-webkit-overflow-scrolling: touch/, 'wide data surfaces must scroll naturally on touch devices');
  assert.match(styles, /\.planner-form[\s\S]*grid-template-columns: minmax\(0, 1fr\)/, 'planner forms must collapse to one column');
});
