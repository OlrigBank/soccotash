import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { parseArguments, parseQueue, writeVerifiedPdf } from '../../site/scripts/capture-airbnb.mjs';
import { appendMessageWindow, parseReviewDialog, sourceIdentity, verifyPdfText } from '../../site/scripts/airbnb-capture/records.mjs';
import { capturePage, defaultSelectors } from '../../site/scripts/airbnb-capture/browser.mjs';
import { parseReviewDates } from '../../site/scripts/airbnb-capture/review-dates.mjs';
import { generateReviewDatasets } from '../../site/scripts/generate-airbnb-review-datasets.mjs';
import { booking, reviewText, reviewPage, bookingPage } from './fixtures.mjs';

const execFile = promisify(execFileCallback);
const root = fileURLToPath(new URL('../../', import.meta.url));
const knownReview = {
  source: { reviewId: '9000000001' },
  stay: { checkIn: '2026-08-27', checkOut: '2026-08-30', nights: 3 },
  publishedAt: '2026-08-30',
};

test('CLI validates scope, run paths and local-only debugging connections', () => {
  assert.throws(() => parseArguments(['reviews', '--run', '../../public', '--url', 'x']));
  assert.throws(() => parseArguments(['render', '--run', 'example']));
  assert.throws(() => parseArguments(['reviews', '--run', 'example', '--url', 'x', '--urls', 'y']));
  for (const cdp of ['http://example.com:9222', 'http://user:secret@127.0.0.1:9222', 'http://127.0.0.1:9222/?token=x']) {
    assert.throws(() => parseArguments(['reviews', '--run', 'example', '--url', 'x', '--cdp', cdp]));
  }
  assert.equal(parseArguments(['reviews', '--run', 'example', '--url', 'x', '--cdp', 'http://127.0.0.1:9222']).command, 'reviews');
});

test('queue validates Airbnb identities, removes duplicate URLs and respects exclusions', () => {
  const url = 'https://www.airbnb.com/progress/reviews?reviewId=123&tracking=unwanted';
  assert.deepEqual(parseQueue('reviews', `${url}\n${url}\n# comment`), [{ id: '123', url: 'https://www.airbnb.com/progress/reviews?reviewId=123' }]);
  assert.equal(parseQueue('bookings', JSON.stringify({ items: [{ url: booking.source.url }, { captureEligible: false, url: 'https://invalid.example' }] })).length, 1);
  assert.equal(sourceIdentity('bookings', `${booking.source.url}?archived=`).url, `${booking.source.url}?archived=`);
  for (const url of ['https://airbnb.com.evil.example/progress/reviews?reviewId=1', 'http://www.airbnb.com/progress/reviews?reviewId=1', 'https://www.airbnb.com/login?reviewId=1']) {
    assert.throws(() => sourceIdentity('reviews', url));
  }
});

test('review parsing preserves private boundaries and refuses missing categories or dates', () => {
  const args = { text: reviewText, reviewId: '9000000001', capturedAt: '2026-09-01T12:00:00Z' };
  const review = parseReviewDialog(args);
  assert.equal(review.publicReview.rating, 4);
  assert.equal(review.publicReview.text, 'A comfortable stay. The garden was lovely.');
  assert.equal(review.privateFeedback.text, 'Private fixture feedback.');
  assert.deepEqual(review.detailedRatings[0].feedback, ['Clear instructions']);
  assert.throws(() => parseReviewDialog({ ...args, text: reviewText.replace('Only visible to you and Airbnb', '') }));
  assert.throws(() => parseReviewDialog({ ...args, text: reviewText.replace('Cleanliness', 'Unsupported category') }));
  assert.throws(() => parseReviewDialog({ ...args, text: reviewText.replace('3 nights', '4 nights') }));
  assert.throws(() => verifyPdfText('reviews', { review }, 'Incomplete PDF'));
});

test('stay identification supports separate or absent publication metadata', () => {
  const args = { reviewId: '9000000001', capturedAt: '2026-09-28T12:00:00Z' };
  const oldLine = 'August 27 – 30 - 3 nights · Published August 30, 2026';
  for (const replacement of ['27–30 August·3 nights\nPublished 30 August 2026', 'August 27 – 30 - 3 nights\nPublished\nAugust 30, 2026']) {
    const parsed = parseReviewDialog({ ...args, text: reviewText.replace(oldLine, replacement) });
    assert.deepEqual(parsed.stay, { ...knownReview.stay, yearSource: 'current-year-assumption' });
    assert.equal(parsed.publishedAt, knownReview.publishedAt);
  }
  const currentText = reviewText.replace(oldLine, '27–30 August·3 nights').replace('Public review\n', 'Public review\n·\n');
  const parsed = parseReviewDialog({ ...args, text: currentText, knownReview });
  assert.deepEqual(parsed.stay, { ...knownReview.stay, yearSource: 'verified-review' });
  assert.equal(parsed.publicReview.rating, 4);
  assert.equal(parseReviewDialog({ ...args, text: currentText }).publishedAt, null);
  assert.throws(() => parseReviewDialog({ ...args, text: currentText, knownReview: { ...knownReview, source: { reviewId: '999' } } }), /different review/u);
  assert.throws(() => parseReviewDialog({ ...args, text: currentText.replace('27–30', '26–29'), knownReview }), /conflict/u);
});

test('review stay parsing retains calendar, duration and year-boundary validation', () => {
  assert.deepEqual(parseReviewDates('30 December–2 January·3 nights', ['Published 3 January 2026'], null, { capturedAt: '2025-12-31T12:00:00Z' }), {
    checkIn: '2025-12-30', checkOut: '2026-01-02', nights: 3, publishedAt: '2026-01-03', yearSource: 'current-year-assumption',
  });
  assert.deepEqual(parseReviewDates('27–28 August 2026·1 night', ['Published 29 August 2026']), {
    checkIn: '2026-08-27', checkOut: '2026-08-28', nights: 1, publishedAt: '2026-08-29', yearSource: 'displayed',
  });
  assert.throws(() => parseReviewDates('27–30 August·4 nights', [], knownReview), /number of nights/u);
  assert.throws(() => parseReviewDates('30–31 February 2026·1 night', ['Published 1 March 2026']), /invalid calendar/u);
  assert.equal(parseReviewDates('27–30 August·3 nights', [], null, { capturedAt: '2027-01-01T00:00:00Z' }).checkIn, '2027-08-27');
  assert.equal(parseReviewDates('27–30 August·3 nights', [], { ...knownReview, stay: { ...knownReview.stay, yearSource: 'current-year-assumption' } }).yearSource, 'current-year-assumption');
});

test('overlapping virtualised message windows retain repeated messages and detect gaps', () => {
  const a = { accessibleLabel: 'a', visibleText: 'Same body' };
  const b = { accessibleLabel: 'b', visibleText: 'Other body' };
  assert.deepEqual(appendMessageWindow([a, a], [a, a, b]), [a, a, b]);
  assert.deepEqual(appendMessageWindow([b, a, a], [a, a, b]), [b, a, a, b]);
  assert.throws(() => appendMessageWindow([a], [b]), /overlap/u);
});

test('missing years use matching reservation evidence and never borrow the publication year', () => {
  const reservation = { propertyId: 'main-house', bookerDisplayName: 'Example Guest', arrival: '2024-08-27', departure: '2024-08-30', nights: 3 };
  const evidence = { capturedAt: '2026-09-28T12:00:00Z', reviewerName: 'Example Guest', propertyId: 'main-house', reservations: [reservation] };
  const dates = parseReviewDates('27–30 August·3 nights', [], null, evidence);
  assert.equal(dates.checkIn, '2024-08-27');
  assert.equal(dates.publishedAt, null);
  assert.equal(dates.yearSource, 'reservation');
  const unmatched = parseReviewDates('27–30 August·3 nights', ['Published 1 September 2023'], null, { ...evidence, propertyId: 'cottage' });
  assert.equal(unmatched.checkIn, '2026-08-27');
  assert.equal(unmatched.yearSource, 'current-year-assumption');
  assert.throws(() => parseReviewDates('27–30 August·3 nights', [], null, { ...evidence, reservations: [reservation, { ...reservation, arrival: '2025-08-27', departure: '2025-08-30' }] }), /Multiple reservation years/u);
});

test('review errors identify every missing section and distinguish incorrect ordering', () => {
  const args = { reviewId: '9000000001', capturedAt: '2026-09-01T12:00:00Z' };
  assert.throws(() => parseReviewDialog({ ...args, text: 'Private guest content' }), (error) => {
    for (const label of ['Review heading:', 'Stay line:', 'Public review heading:', 'Detailed ratings heading:']) assert.ok(error.message.includes(label));
    assert.doesNotMatch(error.message, /Private guest content|Section order:/u);
    return true;
  });
  assert.throws(() => parseReviewDialog({ ...args, text: `Detailed ratings\n${reviewText}` }), (error) => {
    assert.match(error.message, /Section order:/u);
    assert.doesNotMatch(error.message, /heading:|Stay line:/u);
    return true;
  });
});

test('failed review parsing retains the exact extracted text before rejection', { timeout: 15_000 }, async () => {
  const browser = await chromium.launch({ headless: true });
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'airbnb-diagnostics-test-'));
  try {
    const context = await browser.newContext();
    // Malformed duration must still fail, even though separate publication is now supported.
    await context.route('https://www.airbnb.com/**', (route) => route.fulfill({
      contentType: 'text/html', body: reviewPage().replace('3 nights · Published', 'three nights</div><div>Published'),
    }));
    const page = await context.newPage();
    const source = sourceIdentity('reviews', 'https://www.airbnb.com/progress/reviews?reviewId=9000000001');
    const filename = path.join(directory, `${source.id}.dialog.json`);
    let checkpoints = 0;
    const save = async (snapshot) => {
      await fs.writeFile(filename, JSON.stringify(snapshot), { mode: 0o600 });
      checkpoints += 1;
    };
    await assert.rejects(capturePage(page, 'reviews', source, defaultSelectors, save), (error) => {
      assert.match(error.message, /Stay line:/u);
      assert.doesNotMatch(error.message, /Review heading:|Public review heading:|Detailed ratings heading:/u);
      return true;
    });
    assert.equal(checkpoints, 2);
    const snapshot = JSON.parse(await fs.readFile(filename, 'utf8'));
    assert.equal(snapshot.source.reviewId, source.id);
    assert.match(snapshot.dialogText, /nights\s*\n\s*Published/u);
    assert.match(snapshot.renderedText, /Private fixture feedback/u);
    assert.equal(Object.hasOwn(snapshot, 'review'), false);
    assert.equal((await fs.stat(filename)).mode & 0o777, 0o600);
    // Missing readiness headings also leave the initial diagnostic snapshot.
    await context.unrouteAll();
    await context.route('https://www.airbnb.com/**', (route) => route.fulfill({
      contentType: 'text/html', body: reviewPage().replace('Detailed ratings', 'Changed ratings heading'),
    }));
    page.setDefaultTimeout(300);
    checkpoints = 0;
    await assert.rejects(capturePage(page, 'reviews', source, defaultSelectors, save));
    assert.equal(checkpoints, 1);
    assert.match(JSON.parse(await fs.readFile(filename, 'utf8')).dialogText, /Changed ratings heading/u);
  } finally { await browser.close(); await fs.rm(directory, { recursive: true, force: true }); }
});

test('browser capture and CDP printing round-trip through the production PDF parsers', { timeout: 60_000 }, async () => {
  const browser = await chromium.launch({ headless: true });
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'airbnb-capture-test-'));
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  try {
    await context.route('https://www.airbnb.com/**', async (route) => {
      await route.fulfill({ contentType: 'text/html', body: route.request().url().includes('progress/reviews')
        ? reviewPage().replace('August 27 – 30 - 3 nights · Published August 30, 2026', '27–30 August·3 nights') : bookingPage() });
    });
    for (const [kind, url] of [['reviews', 'https://www.airbnb.com/progress/reviews?reviewId=9000000001'], ['bookings', booking.source.url]]) {
      const page = await context.newPage();
      const capture = await capturePage(page, kind, sourceIdentity(kind, url), { ...defaultSelectors, reservation: 'aside', messageScroller: '#messages' }, undefined, undefined);
      const pdf = await writeVerifiedPdf(context, kind, capture, path.join(directory, `${kind}.pdf`));
      assert.ok(pdf.pages >= (kind === 'bookings' ? 3 : 1));
      assert.match(pdf.sha256, /^[a-f0-9]{64}$/u);
      if (kind === 'reviews') {
        assert.equal(capture.review.publicReview.rating, 4);
        assert.equal(capture.review.publishedAt, null);
        const datasets = await generateReviewDatasets({ directory,
          privateOutput: path.join(directory, 'private.json'), publicOutput: path.join(directory, 'public.json'), summaryOutput: path.join(directory, 'summary.json'), approvedAt: '2026-09-28',
        });
        assert.equal(datasets.privateData.reviews[0].publishedAt, null);
        assert.equal(datasets.privateData.reviews[0].stay.yearSource, 'current-year-assumption');
        assert.equal(Object.hasOwn(datasets.publicReviews[0].stay, 'yearSource'), false);
      }
      else assert.equal(capture.conversation.groups.length, 2);
      await page.close();
    }
  } finally { await browser.close(); await fs.rm(directory, { recursive: true, force: true }); }
});

test('terminal render resumes raw captures, skips verified files, and refuses tampered evidence', { timeout: 60_000 }, async () => {
  const run = `fixture-${process.pid}-${Date.now()}`;
  const rawRoot = path.join(root, '.airbnb-capture/runs', run);
  const pdfRoot = path.join(root, 'output/pdf/airbnb-terminal', run);
  const directory = path.join(rawRoot, 'reviews');
  const id = '9000000001';
  const review = parseReviewDialog({ text: reviewText, reviewId: id, capturedAt: '2026-09-01T08:00:00Z' });
  const capture = { schemaVersion: 1, source: { reviewId: id }, review };
  const args = ['site/scripts/capture-airbnb.mjs', 'render', '--kind', 'reviews', '--run', run, '--channel', 'chromium'];
  try {
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    await fs.writeFile(path.join(directory, `${id}.json`), JSON.stringify(capture), { mode: 0o600 });
    const first = await execFile(process.execPath, args, { cwd: root });
    assert.match(first.stdout, /1\/1 verified; 0 failed/u);
    const pdfPath = path.join(pdfRoot, 'reviews', `${id}.pdf`);
    const firstPdf = await fs.readFile(pdfPath);
    assert.equal((await fs.stat(pdfPath)).mode & 0o777, 0o600);
    const second = await execFile(process.execPath, args, { cwd: root });
    assert.match(second.stdout, /Verified saved reviews/u);
    assert.deepEqual(await fs.readFile(pdfPath), firstPdf);
    await fs.writeFile(pdfPath, 'tampered');
    await assert.rejects(execFile(process.execPath, args, { cwd: root }), (error) => {
      assert.equal(error.code, 1);
      assert.doesNotMatch(error.stdout + error.stderr, /Private fixture feedback|Example Guest/u);
      return true;
    });
    assert.equal(await fs.readFile(pdfPath, 'utf8'), 'tampered');
    await assert.rejects(fs.stat(path.join(directory, 'run.lock')), { code: 'ENOENT' });
  } finally {
    await fs.rm(rawRoot, { recursive: true, force: true });
    await fs.rm(pdfRoot, { recursive: true, force: true });
  }
});

test('a login redirect or missing Earnings is a failed capture, never an empty booking', { timeout: 15_000 }, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    await context.route('https://www.airbnb.com/**', (route) => route.request().url().includes('progress/reviews')
      ? route.fulfill({ status: 302, headers: { location: 'https://www.airbnb.com/login' } })
      : route.fulfill({ contentType: 'text/html', body: '<html><body>Sign in to Airbnb</body></html>' }));
    const page = await context.newPage();
    page.setDefaultTimeout(300);
    await assert.rejects(capturePage(page, 'reviews', sourceIdentity('reviews', 'https://www.airbnb.com/progress/reviews?reviewId=123'), { ...defaultSelectors, reviewDialog: 'body' }));
    await context.unrouteAll();
    await context.route('https://www.airbnb.com/**', (route) => route.fulfill({ contentType: 'text/html', body: '<html><body><aside>A booking enquiry without confirmed earnings</aside></body></html>' }));
    await assert.rejects(capturePage(page, 'bookings', sourceIdentity('bookings', booking.source.url), { ...defaultSelectors, reservation: 'aside' }));
  } finally { await browser.close(); }
});
