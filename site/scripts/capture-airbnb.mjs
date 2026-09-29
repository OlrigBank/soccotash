#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { createInterface } from 'node:readline/promises';
import { chromium } from '@playwright/test';
import { capturePage, defaultSelectors } from './airbnb-capture/browser.mjs';
import { renderCapture, sourceIdentity, verifyPdfText } from './airbnb-capture/records.mjs';

const execFile = promisify(execFileCallback);
const root = fileURLToPath(new URL('../../', import.meta.url));
const privateRoot = path.join(root, '.airbnb-capture');
const pdfRoot = path.join(root, 'output/pdf/airbnb-terminal');
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
export const help = `Airbnb terminal capture (Node 24+, Chrome, Poppler)

  npm run airbnb:browser
  npm run airbnb:capture -- reviews --run september --urls .airbnb-capture/reviews.txt
  npm run airbnb:capture -- bookings --run september --urls .airbnb-capture/bookings.json
  npm run airbnb:capture -- render --kind reviews --run september

Commands:
  browser   Open a dedicated, persistent Chrome profile; sign in manually.
  reviews   Capture explicit Airbnb review URLs and verify their PDFs.
  bookings  Capture explicit booking conversation URLs and verify their PDFs.
  render    Resume PDF generation from saved raw captures, without Airbnb access.

Options:
  --run NAME          Required for captures/render; letters, digits, hyphens only.
  --urls FILE         One URL per line, a JSON array of URLs, or existing {items} queue.
  --url URL           Capture one URL instead of a file.
  --kind TYPE         reviews or bookings (render only).
  --selectors FILE    JSON overrides for selectors in docs/airbnb-terminal-capture.md.
  --review-metadata FILE  Verified dates for reviews; defaults to the private review manifest.
  --reservation-metadata FILE  Local reservation evidence for resolving missing stay years.
  --cdp URL           Connect to local Chrome instead of launching the private profile.
  --channel NAME      chrome (default) or chromium (Playwright installation).
  --help              Show this help.

Private captures: .airbnb-capture/runs/NAME/TYPE/
Verified PDFs: output/pdf/airbnb-terminal/NAME/TYPE/
Unchanged completed items are verified and skipped. Failed items retry on rerun.
No database writes, guest messages or public website updates are performed.
`;

export function parseArguments(args) {
  if (!args.length || args.includes('--help')) return { help: true };
  const [command, ...rest] = args;
  if (!['browser', 'reviews', 'bookings', 'render'].includes(command)) throw new Error('Unknown command. Use --help.');
  const options = { command, channel: 'chrome' };
  const allowed = new Set(['run', 'urls', 'url', 'kind', 'selectors', 'cdp', 'channel', 'review-metadata', 'reservation-metadata']);
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index].slice(2);
    if (!rest[index].startsWith('--') || !allowed.has(key) || !rest[index + 1] || rest[index + 1].startsWith('--')) throw new Error('Invalid option. Use --help.');
    if (Object.hasOwn(options, key) && key !== 'channel') throw new Error('Duplicate option.');
    options[key] = rest[index + 1];
  }
  if (!['chrome', 'chromium'].includes(options.channel)) throw new Error('Channel must be chrome or chromium.');
  if (command !== 'browser' && !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,79}$/u.test(options.run ?? '')) throw new Error('Provide a valid --run name.');
  if (['reviews', 'bookings'].includes(command) && Boolean(options.urls) === Boolean(options.url)) throw new Error('Provide exactly one of --url or --urls.');
  if (command === 'render' && !['reviews', 'bookings'].includes(options.kind)) throw new Error('Render requires --kind reviews or bookings.');
  if (command !== 'render' && options.kind) throw new Error('--kind is only valid for render.');
  if (options['review-metadata'] && command !== 'reviews') throw new Error('--review-metadata is only valid for reviews.');
  if (options['reservation-metadata'] && command !== 'reviews') throw new Error('--reservation-metadata is only valid for reviews.');
  if (['browser', 'render'].includes(command) && (options.url || options.urls || options.selectors)) throw new Error('Capture options are only valid for reviews/bookings.');
  if (command === 'browser' && (options.cdp || options.run)) throw new Error('Browser opens its dedicated local profile; no --cdp or --run is needed.');
  if (options.cdp) {
    const endpoint = new URL(options.cdp);
    if (endpoint.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)
      || endpoint.username || endpoint.password || endpoint.pathname !== '/' || endpoint.search || endpoint.hash) {
      throw new Error('--cdp must be a loopback HTTP endpoint, e.g. http://127.0.0.1:9222.');
    }
  }
  return options;
}

export function parseQueue(kind, contents) {
  const input = contents.trim();
  const data = /^[\[{]/u.test(input) ? JSON.parse(input) : input.split(/\r?\n/u).map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
  const items = Array.isArray(data) ? data : data.items;
  if (!Array.isArray(items) || !items.length) throw new Error('URL queue is empty or invalid.');
  const unique = new Map();
  for (const item of items) {
    if (typeof item === 'object' && item?.captureEligible === false) continue;
    const source = sourceIdentity(kind, typeof item === 'string' ? item : item?.url);
    unique.set(source.id, source);
  }
  if (!unique.size) throw new Error('Queue contains no eligible URLs.');
  return [...unique.values()];
}

async function privateDirectory(directory) {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  // Refuse symlink destinations; captures must stay beneath their private roots.
  if ((await fs.realpath(directory)) !== directory) throw new Error('Private output directory must not contain symlinks.');
  await fs.chmod(directory, 0o700);
}

async function atomicWrite(filename, contents) {
  const temporary = `${filename}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, contents, { mode: 0o600, flag: 'wx' });
    await fs.rename(temporary, filename);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

async function readJson(filename, fallback) {
  try { return JSON.parse(await fs.readFile(filename, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}

async function openBrowser(options, offline = false) {
  if (offline) {
    const browser = await chromium.launch({ headless: true, ...(options.channel === 'chrome' ? { channel: 'chrome' } : {}) });
    const context = await browser.newContext();
    return { context, close: () => browser.close() };
  }
  if (options.cdp) {
    const browser = await chromium.connectOverCDP(options.cdp);
    const context = browser.contexts()[0];
    if (!context) { await browser.close(); throw new Error('Chrome has no browser context.'); }
    // For a connected browser close() disconnects; it does not terminate Chrome.
    return { context, close: () => browser.close() };
  }
  const profile = path.join(privateRoot, 'chrome-profile');
  await privateDirectory(profile);
  const context = await chromium.launchPersistentContext(profile, {
    headless: false, ...(options.channel === 'chrome' ? { channel: 'chrome' } : {}),
    viewport: { width: 1440, height: 1000 }, locale: 'en-GB', timezoneId: 'Europe/London',
  });
  return { context, close: () => context.close() };
}

export async function writeVerifiedPdf(context, kind, capture, filename) {
  try { return await writePdfAttempt(context, kind, capture, filename, false); }
  catch (error) {
    if (kind !== 'bookings' || error.code !== 'AIRBNB_MESSAGES_INVALID') throw error;
    return writePdfAttempt(context, kind, capture, filename, true);
  }
}

async function writePdfAttempt(context, kind, capture, filename, omitMessages) {
  const page = await context.newPage();
  const temporary = `${filename}.${crypto.randomUUID()}.tmp.pdf`;
  try {
    // Print only locally generated, escaped HTML. It has no remote dependencies.
    await page.route('**/*', (route) => route.abort());
    await page.setContent(renderCapture(kind, capture, { omitMessages }), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const cdp = await context.newCDPSession(page);
    let printed;
    try {
      printed = await cdp.send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true, displayHeaderFooter: false });
    } finally { await cdp.detach(); }
    const buffer = Buffer.from(printed.data, 'base64');
    await fs.writeFile(temporary, buffer, { flag: 'wx', mode: 0o600 });
    const verification = await verifyPdfFile(kind, capture, temporary);
    await fs.rename(temporary, filename);
    return { sha256: hash(buffer), ...verification };
  } finally {
    await fs.rm(temporary, { force: true });
    await page.close();
  }
}

async function verifyPdfFile(kind, capture, filename) {
  const [text, info] = await Promise.all([
    execFile('pdftotext', ['-layout', filename, '-'], { maxBuffer: 16 * 1024 * 1024 }),
    execFile('pdfinfo', [filename]),
  ]);
  const pages = Number(info.stdout.match(/^Pages:\s+(\d+)$/mu)?.[1]);
  if (!pages || !/^Page size:.*\(A4\)/mu.test(info.stdout)) throw new Error('PDF is not valid A4 output.');
  return { pages, ...verifyPdfText(kind, capture, text.stdout) };
}

export async function run(options) {
  process.umask(0o077);
  await privateDirectory(privateRoot);
  if (options.command === 'browser') {
    if (!process.stdin.isTTY) throw new Error('Browser sign-in requires an interactive terminal.');
    const browser = await openBrowser(options);
    const readline = createInterface({ input: process.stdin, output: process.stdout });
    try {
      const page = await browser.context.newPage();
      await page.goto('https://www.airbnb.com/progress/reviews');
      await readline.question('Sign into Airbnb in Chrome, set the host interface to English/GBP, then press Enter here to save and close this capture browser. ');
    } finally { readline.close(); await browser.close(); }
    return;
  }
  // Check extraction dependencies before opening a signed-in browser.
  await Promise.all([execFile('pdftotext', ['-v']), execFile('pdfinfo', ['-v'])]);
  const kind = options.command === 'render' ? options.kind : options.command;
  const directory = path.join(privateRoot, 'runs', options.run, kind);
  const pdfDirectory = path.join(pdfRoot, options.run, kind);
  await privateDirectory(directory);
  await privateDirectory(pdfDirectory);
  const lockPath = path.join(directory, 'run.lock');
  const lock = await fs.open(lockPath, 'wx', 0o600).catch(() => { throw new Error('Run is locked. Close its active process; see the guide for stale-lock recovery.'); });
  let browser;
  try {
    await lock.writeFile(`${process.pid}\n`);
    const selectors = { ...defaultSelectors };
    if (options.selectors) {
      const overrides = JSON.parse(await fs.readFile(path.resolve(options.selectors), 'utf8'));
      for (const [key, value] of Object.entries(overrides)) {
        if (!(key in selectors) || (typeof value !== 'string' && !(key === 'messageScroller' && value === null))) throw new Error('Invalid selector override.');
        selectors[key] = value;
      }
    }
    const manifestPath = path.join(directory, 'manifest.json');
    const manifest = await readJson(manifestPath, { schemaVersion: 1, kind, items: {} });
    if (manifest.schemaVersion !== 1 || manifest.kind !== kind || !manifest.items) throw new Error('Incompatible run manifest.');
    const sources = options.command === 'render'
      ? (await fs.readdir(directory)).filter((name) => /^\d+\.json$/u.test(name)).map((name) => ({ id: name.slice(0, -5) }))
      : parseQueue(kind, options.url || await fs.readFile(path.resolve(options.urls), 'utf8'));
    if (!sources.length) throw new Error('No raw captures found for this run.');
    const knownReviews = new Map();
    if (options.command === 'reviews') {
      const metadataPath = options['review-metadata'] ? path.resolve(options['review-metadata'])
        : path.join(root, 'docs/source-material/airbnb/reviews/private-review-manifest.json');
      const metadata = await readJson(metadataPath, options['review-metadata'] ? null : { reviews: [] });
      if (!Array.isArray(metadata?.reviews)) throw new Error('Review metadata must contain a reviews array.');
      for (const review of metadata.reviews) {
        const id = review.source?.reviewId;
        if (typeof id !== 'string' || !/^\d+$/u.test(id) || knownReviews.has(id)) throw new Error('Review metadata has missing or duplicate identities.');
        knownReviews.set(id, review);
      }
    }
    const reservationMetadata = options['reservation-metadata']
      ? await readJson(path.resolve(options['reservation-metadata']), null) : { reservations: [] };
    if (!Array.isArray(reservationMetadata?.reservations)) throw new Error('Reservation metadata must contain a reservations array.');
    browser = await openBrowser(options, options.command === 'render');
    let failures = 0;
    let completed = 0;
    for (const source of sources) {
      const rawPath = path.join(directory, `${source.id}.json`);
      const pdfPath = path.join(pdfDirectory, `${source.id}.pdf`);
      let stage = 'resume';
      let page;
      try {
        const existing = manifest.items[source.id];
        let capture = await readJson(rawPath, null);
        if (capture) {
          const identity = kind === 'reviews' ? capture.source?.reviewId : capture.source?.conversationId;
          if (identity !== source.id || (kind === 'reviews' && capture.review?.source.reviewId !== source.id)) throw new Error('Saved capture identity differs from its filename.');
          if (existing?.rawSha256 && hash(await fs.readFile(rawPath)) !== existing.rawSha256) throw new Error('Saved raw capture changed.');
        }
        if (existing?.status === 'complete') {
          if (!capture || hash(await fs.readFile(pdfPath)) !== existing.pdf.sha256) throw new Error('Completed capture is missing or modified.');
          await verifyPdfFile(kind, capture, pdfPath);
          completed += 1;
          console.log(`Verified saved ${kind} item ${completed}/${sources.length}.`);
          continue;
        }
        if (!capture) {
          if (options.command === 'render') throw new Error('Raw capture missing.');
          stage = 'capture';
          page = await browser.context.newPage();
          page.setDefaultTimeout(30_000);
          capture = await capturePage(page, kind, source, selectors, async (snapshot) => {
            await atomicWrite(path.join(directory, `${source.id}.dialog.json`), `${JSON.stringify(snapshot, null, 2)}\n`);
          }, knownReviews.get(source.id), reservationMetadata.reservations);
          await atomicWrite(rawPath, `${JSON.stringify(capture, null, 2)}\n`);
        }
        const rawSha256 = hash(await fs.readFile(rawPath));
        manifest.items[source.id] = { status: 'captured', rawSha256 };
        await atomicWrite(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
        stage = 'pdf';
        const pdf = await writeVerifiedPdf(browser.context, kind, capture, pdfPath);
        manifest.items[source.id] = { status: 'complete', rawSha256, pdf };
        await fs.rm(path.join(directory, `${source.id}.error.txt`), { force: true });
        completed += 1;
        if (pdf.conversationStatus === 'incomplete') console.warn('Booking and finances verified; messages omitted from PDF and retained in JSON for repair.');
        console.log(`Captured and verified ${kind} item ${completed}/${sources.length}.`);
      } catch (error) {
        failures += 1;
        // Detailed diagnostics are local/private. Never print Playwright call logs,
        // guest content or source URLs to the terminal.
        await atomicWrite(path.join(directory, `${source.id}.error.txt`), `${stage}\n${error.stack ?? error}\n`);
        // Preserve completed hashes on corruption, so reruns cannot silently accept edits.
        if (manifest.items[source.id]?.status !== 'complete') manifest.items[source.id] = { ...manifest.items[source.id], status: 'failed', stage };
        console.error(`Item failed during ${stage}; inspect the private run directory. ${stage === 'pdf' ? 'Continuing with remaining items; failed JSON is retained for retry.' : 'Stopping; remaining items can resume on rerun.'}`);
        // Local PDF failures must not block independent records. Stop on capture
        // or integrity failures rather than repeatedly visiting a broken session.
        if (stage !== 'pdf') break;
      } finally {
        if (page) await page.close();
        await atomicWrite(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      }
    }
    console.log(`${completed}/${sources.length} verified; ${failures} failed. PDFs: output/pdf/airbnb-terminal/${options.run}/${kind}/`);
    if (failures) process.exitCode = 1;
  } finally {
    try { if (browser) await browser.close(); }
    finally { await lock.close(); await fs.rm(lockPath, { force: true }); }
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  let options;
  try {
    options = parseArguments(process.argv.slice(2));
    if (options.help) console.log(help);
    else await run(options);
  } catch (error) {
    // Startup errors must not include browser logs or authentication material.
    if (!options) console.error(`${error.message} Use --help.`);
    else {
      try {
        await privateDirectory(privateRoot);
        await atomicWrite(path.join(privateRoot, 'startup-error.txt'), `${error.stack ?? error}\n`);
      } catch { /* Preserve the original startup failure even if diagnostics cannot be written. */ }
      console.error(`Airbnb command could not start${error.code === 'ENOENT' ? ': a required file or executable is missing' : ''}. Inspect .airbnb-capture/startup-error.txt and docs/airbnb-terminal-capture.md.`);
    }
    process.exitCode = 1;
  }
}
