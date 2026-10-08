import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';

const origin = new URL(process.env.WELCOME_PREVIEW_URL || 'http://127.0.0.1:8098');
if (!['localhost', '127.0.0.1'].includes(origin.hostname)) throw new Error('Export only from a rebuilt local preview.');
const output = resolve(process.argv[2] || 'output/pdf/olrig-bank-welcome-poster.pdf');
await mkdir(dirname(output), { recursive: true });
await mkdir('test-results/welcome-print', { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1123, height: 1587 } });
  await page.goto(new URL('/welcome/print/', origin).href);
  await page.evaluate(() => Promise.all([...document.images].map(image => image.decode())));
  await page.getByRole('status').filter({ hasText: 'Single-page fit:' }).waitFor();
  await page.pdf({ path: output, preferCSSPageSize: true, printBackground: true, tagged: true });
  await page.pdf({ path: 'test-results/welcome-print/a3-without-backgrounds.pdf', preferCSSPageSize: true, printBackground: false });
  await page.getByLabel('Paper size').selectOption('A4');
  await page.pdf({ path: 'test-results/welcome-print/a4.pdf', preferCSSPageSize: true, printBackground: true });
  await page.pdf({ path: 'test-results/welcome-print/a4-without-backgrounds.pdf', preferCSSPageSize: true, printBackground: false });
  console.log(`Exported ${output}; A3/A4 comparison PDFs in test-results/welcome-print.`);
} finally { await browser.close(); }
