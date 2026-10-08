import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const { parse } = createRequire(new URL('../../site/package.json', import.meta.url))('yaml');
const content = parse(readFileSync(new URL('../../site/src/data/welcome.yml', import.meta.url), 'utf8'));
const activeTopics = content.topics.filter((topic: { status: string }) => topic.status === 'active');

test('welcome page offers stable topic links, guidance and a shared print view', async ({ page }) => {
  const faults: string[] = [];
  page.on('pageerror', error => faults.push(error.message));
  await page.goto('/welcome/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(content.title);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://olrig-bank.com/welcome/');
  await expect(page.locator('[data-welcome-topic]')).toHaveCount(activeTopics.length);
  await expect(page.locator('.welcome__number')).toHaveCount(0);
  await expect(page.locator('.quick-check-band')).toHaveCount(0);
  const destination = activeTopics.at(-1);
  if (destination) {
    const jump = page.getByRole('navigation', { name: 'Welcome topics' }).locator(`a[href="#${destination.id}"]`);
    await jump.focus();
    expect(await jump.evaluate(element => getComputedStyle(element).outlineStyle)).toBe('solid');
    await jump.press('Enter');
    expect(new URL(page.url()).hash).toBe(`#${destination.id}`);
    await expect(page.locator(`#${destination.id}`)).toBeInViewport();
  } else {
    await expect(page.locator('.welcome__empty')).toContainText('contact Jenna');
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  const summaries = await page.locator('.welcome__copy > p:first-of-type').allTextContents();
  await page.getByRole('link', { name: 'Print welcome poster', exact: true }).click();
  await expect(page).toHaveURL(/\/welcome\/print\/$/);
  expect(await page.locator('.welcome__copy > p:first-of-type').allTextContents()).toEqual(summaries);
  await expect(page.locator('.welcome__qr img')).toHaveCount(activeTopics.length);
  await expect(page.locator('.welcome__number')).toHaveCount(activeTopics.length);
  expect(await page.locator('.welcome__qr img').evaluateAll(images => images.every(image => (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.getByLabel('Paper size').selectOption('A4');
  await expect.poll(() => page.locator('#welcome-paper-size').evaluate(element => element.textContent)).toContain('A4 portrait');
  await page.evaluate(() => { (window as any).__printed = false; window.print = () => { (window as any).__printed = true; }; });
  await page.getByRole('button', { name: 'Print welcome poster' }).focus();
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => (window as any).__printed)).toBe(true);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.welcome__print-controls')).toBeHidden();
  expect(faults).toEqual([]);
});

test('existing information destinations retain their fragment targets', async ({ page }) => {
  await page.goto('/welcome/');
  const links = await page.locator('[data-welcome-topic] .welcome__details').evaluateAll(elements => elements.map(element => element.getAttribute('href')!));
  for (const href of links) {
    const response = await page.goto(href);
    if (response) expect(response.ok(), href).toBe(true);
    else expect((await page.request.get(href)).ok(), href).toBe(true);
    const fragment = new URL(page.url()).hash.slice(1);
    if (fragment) await expect(page.locator(`[id="${fragment}"]`)).toHaveCount(1);
  }
  await page.goto('/guest-information/');
  await expect(page.getByRole('link', { name: 'Welcome page', exact: true })).toHaveAttribute('href', '/welcome/');
});

test('welcome and print guidance remain useful without JavaScript', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  const topic = activeTopics[0];
  await page.goto(`${baseURL}/welcome/${topic ? `#${topic.id}` : ''}`);
  if (topic) {
    await expect(page.locator(`#${topic.id}`)).toBeVisible();
    await expect(page.locator(`#${topic.id} .welcome__details`)).toHaveAttribute('href', topic.detailsUrl);
  } else {
    await expect(page.locator('.welcome__empty')).toContainText('contact Jenna');
  }
  await page.getByRole('link', { name: 'Print welcome poster', exact: true }).click();
  await expect(page.getByText(/your browser’s Print command/)).toBeVisible();
  await expect(page.locator('.welcome__qr img')).toHaveCount(activeTopics.length);
  await context.close();
});

test('poster fits one page for both paper sizes, including longer CMS summaries', async ({ page }, testInfo) => {
  await page.goto('/welcome/print/');
  await expect(page.getByRole('status')).toContainText('Single-page fit:');
  for (const longer of [false, true]) {
    if (longer) await page.locator('.welcome__copy > p:first-of-type').evaluateAll(elements => {
      elements.forEach(element => { element.textContent = `${element.textContent} ${'Additional guest guidance for this stay. '.repeat(30)}`; });
    });
    for (const paper of ['A3', 'A4']) {
      await page.getByLabel('Paper size').selectOption(paper);
      const pdf = await page.pdf({ path: testInfo.outputPath(`${paper}-${longer ? 'long' : 'current'}.pdf`), preferCSSPageSize: true, printBackground: true });
      expect(pdf.toString('latin1').match(/\/Type \/Page\b/g)).toHaveLength(1);
      if (longer && activeTopics.length) await expect(page.getByRole('status')).toContainText('shorten the CMS summaries');
    }
  }
});
