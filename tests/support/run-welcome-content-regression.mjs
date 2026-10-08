import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { mkdirSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { resolve, extname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';

// Serial build test: restore both files and the original build even on failure.
// The static presentation server cannot reach a database or send notifications.
const { parse, stringify } = createRequire(new URL('../../site/package.json', import.meta.url))('yaml');
mkdirSync('test-results', { recursive: true });
const lockPath = 'test-results/welcome-content.lock';
const lock = openSync(lockPath, 'wx');
const contentPath = new URL('../../site/src/data/welcome.yml', import.meta.url);
const contactPath = new URL('../../site/src/data/settings/contact.yml', import.meta.url);
const [original, originalContact] = await Promise.all([readFile(contentPath, 'utf8'), readFile(contactPath, 'utf8')]);
const content = parse(original);
const build = () => execFileSync('npm', ['--prefix', 'site', 'run', 'build'], { stdio: 'pipe' });
const inspect = () => new Promise(resolve => setTimeout(resolve, Math.min(Number(process.env.WELCOME_VARIANT_INSPECTION_MS) || 0, 45000)));
const root = resolve('site/dist/client');
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const path = resolve(root, `.${pathname.endsWith('/') ? `${pathname}index.html` : pathname}`);
    if (!path.startsWith(`${root}/`)) throw new Error('Invalid path');
    const data = await readFile(path);
    const type = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' }[extname(path)] || 'application/octet-stream';
    response.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' }); response.end(data);
  } catch { response.writeHead(404); response.end('Not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
console.log(`Welcome content fixture preview: ${origin}`);
let browser;
try {
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const edited = structuredClone(content);
  edited.topics.reverse();
  edited.topics.find(topic => topic.id === 'garden').status = 'retired';
  const arrival = edited.topics.find(topic => topic.id === 'parking-access');
  arrival.aliases = ['arrival'];
  arrival.title = 'Arrival and parking';
  arrival.summary = 'Follow the booking guidance and leave access clear. '.repeat(9) + '<script>window.bad = true</script>';
  arrival.detailsUrl = 'https://example.invalid/current-guidance';
  edited.topics.push({ ...arrival, id: 'added-topic', title: 'Additional guidance', aliases: [] });
  await writeFile(contentPath, stringify(edited));
  await writeFile(contactPath, stringify({ ...parse(originalContact), phone: '+44 1234 567890', email: 'welcome-fixture@example.invalid' }));
  build();
  await page.goto(`${origin}/welcome/#garden`);
  assert.match(await page.locator('#garden').innerText(), /retired/);
  assert.equal(await page.locator('#arrival').count(), 1);
  assert.equal(await page.locator('[data-welcome-topic]').first().getAttribute('id'), 'departure');
  assert.equal(await page.locator('#added-topic').count(), 1);
  assert.equal(await page.locator('#parking-access .welcome__details').getAttribute('href'), arrival.detailsUrl);
  assert.match(await page.locator('#help').innerText(), /welcome-fixture@example.invalid/);
  assert.equal(await page.evaluate(() => window.bad), undefined);
  assert.equal(await page.locator('#parking-access script').count(), 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  const summaries = await page.locator('.welcome__copy > p:first-of-type').allTextContents();
  await page.goto(`${origin}/welcome/print/`);
  assert.equal(await page.locator('#garden').count(), 0);
  assert.deepEqual(await page.locator('.welcome__copy > p:first-of-type').allTextContents(), summaries);
  assert.equal(await page.locator('.welcome__qr').count(), 6);
  await page.emulateMedia({ media: 'print' });
  assert.equal(await page.locator('[data-welcome-topic]').evaluateAll(topics => topics.every(topic => getComputedStyle(topic).breakInside === 'avoid')), true);
  console.log('Edited, reordered, added, retired, aliased, long and escaped content builds render correctly; contact changes reach both views.');
  await inspect();

  const empty = structuredClone(content); empty.topics.forEach(topic => { topic.status = 'retired'; });
  await writeFile(contentPath, stringify(empty)); build();
  await page.emulateMedia({ media: 'screen' });
  await page.goto(`${origin}/welcome/`);
  assert.equal(await page.locator('[data-welcome-topic]').count(), 0);
  assert.match(await page.locator('.welcome__empty').innerText(), /contact Jenna/);
  assert.equal(await page.locator('.welcome__retired-topic').count(), 6);
  await page.goto(`${origin}/welcome/print/`);
  assert.equal(await page.locator('.welcome__qr').count(), 0);
  assert.match(await page.locator('.welcome__empty').innerText(), /contact Jenna/);
  console.log('Empty web and print views provide useful guidance; all retired fragments remain on the web page.');
  await inspect();

  for (const mutation of [
    value => { value.topics[0].detailsUrl = 'javascript:alert(1)'; },
    value => { value.topics[1].id = value.topics[0].id; },
    value => { value.topics[0].summary = ''; },
  ]) {
    const invalid = structuredClone(content); mutation(invalid); await writeFile(contentPath, stringify(invalid));
    assert.throws(build, 'Invalid public content must fail the build.');
  }
  console.log('Unsafe links, duplicate IDs and missing summaries fail production builds.');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  await writeFile(contentPath, original); await writeFile(contactPath, originalContact);
  try { build(); } finally { closeSync(lock); unlinkSync(lockPath); }
}
