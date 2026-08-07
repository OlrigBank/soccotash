import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { renderSafeLocalGuideMarkdown } from '../../src/lib/local-guide/markdown.ts';

test('public Local Guide runtime uses PostgreSQL without a content fallback', async () => {
  const route = await readFile(new URL('../../src/pages/local-guide/[slug].astro', import.meta.url), 'utf8');
  const content = await readFile(new URL('../../src/lib/content.ts', import.meta.url), 'utf8');
  assert.match(route, /prerender = false/);
  assert.match(route, /resolvePublishedLocalGuideSlug/);
  assert.match(route, /status = 404/);
  assert.match(route, /Cache-Control', 'no-store, private'/);
  assert.match(content, /listPublishedLocalGuideEntries/);
  assert.doesNotMatch(route + content, /getCollection\(['"]localGuide/);
});

test('controlled Markdown renderer escapes active content and unsafe links', () => {
  const html = renderSafeLocalGuideMarkdown(`# Safe\n\n<script>alert(1)</script>\n\n[bad](javascript:alert(1)) [good](https://example.com)\n\n- **one**\n- two`);
  assert.match(html, /<h1>Safe<\/h1>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script|javascript:/i);
  assert.match(html, /href="https:\/\/example\.com"/);
  assert.match(html, /<ul>[\s\S]*<strong>one<\/strong>/);
});

test('controlled Markdown renderer rejects encoded control characters and embedded HTML', () => {
  const html = renderSafeLocalGuideMarkdown(`[control](java&#x0A;script:alert(1))\n\n<img src=x onerror=alert(1)>`);
  assert.doesNotMatch(html, /href=/);
  assert.doesNotMatch(html, /<img/i);
  assert.match(html, /&lt;img/);
});
