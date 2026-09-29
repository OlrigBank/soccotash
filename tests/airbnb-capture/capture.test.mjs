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


test('booking capture opens the amount card covering the Earnings button', { timeout: 20_000 }, async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  try {
    const button = `<button aria-label="Earnings" onclick="document.querySelector('[role=dialog]').hidden=false">Earnings</button>`;
    const card = `<div style="position:relative;width:240px;height:60px">
      <button aria-label="Earnings" style="position:absolute;inset:0" onclick="throw new Error('Covered button must not be clicked')">Earnings</button>
      <div data-testid="hosting-details-payment-info" style="position:absolute;inset:0;background:white" onclick="document.querySelector('[role=dialog]').hidden=false">£100.00 Total for 2 nights</div>
    </div>`;
    const html = bookingPage().replace(button, '').replace('</aside>', `${card}</aside>`);
    await context.route('https://www.airbnb.com/**', route => route.fulfill({ contentType: 'text/html', body: html }));
    const page = await context.newPage();
    const capture = await capturePage(page, 'bookings', sourceIdentity('bookings', booking.source.url), {
      ...defaultSelectors, reservation: 'aside', messageScroller: '#messages',
    });
    assert.deepEqual(capture.earnings.tabs.map(tab => tab.name), ['You earn', 'Guest paid']);
    assert.equal(capture.conversation.groups.length, 2);
  } finally { await browser.close(); }
});


test('British message dates preserve display labels and validate 24-hour times', async () => {
  const { parseMessageGroup } = await import('../../site/scripts/generate-airbnb-message-booking-html.mjs');
  for (const [date, time] of [['30 Apr', '17:45'], ['1 Sept', '00:00'], ['1 Sept 2026', '23:59'], ['Apr 30, 2026', '5:45 PM']]) {
    const parsed = parseMessageGroup({ index: 0, accessibleLabel: `${date}. Example Guest sent Hello. Sent ${date}, ${time}. Read by Host`, visibleText: 'Hello' });
    assert.equal(parsed.sender, 'Example Guest');
    assert.equal(parsed.sentDate, date);
    assert.equal(parsed.sentTime, time);
    assert.equal(parsed.body, 'Hello');
  }
  for (const time of ['24:00', '12:60', '0:15 PM', '13:00 AM']) {
    assert.throws(() => parseMessageGroup({ index: 0, accessibleLabel: `Example Guest sent Hello. Sent 30 Apr, ${time}`, visibleText: 'Hello' }));
  }
});

test('British booking capture round-trips PDF dates, messages and finances', { timeout: 30_000 }, async () => {
  const { parseAirbnbBookingPdfText } = await import('../../site/src/lib/airbnb-import/booking-pdf.ts');
  const browser = await chromium.launch({ headless: true });
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'airbnb-british-dates-'));
  try {
    const capture = structuredClone(booking);
    capture.reservation.visibleText = capture.reservation.visibleText.replace('Oct 24 – 26', '4–6 Sept').replace('4:00 PM', '16:00').replace('10:00 AM', '10:00');
    capture.conversation.groups[0].accessibleLabel = '30 Apr. Example Guest sent A synthetic booking message. Sent 30 Apr, 17:45';
    capture.conversation.groups[1].accessibleLabel = 'Airbnb service says Booking confirmed. Sent 1 Sept 2026, 00:00';
    capture.conversation.groups[0].visibleText += ' 🎉';
    const filename = path.join(directory, 'booking.pdf');
    await writeVerifiedPdf(await browser.newContext(), 'bookings', capture, filename);
    const { stdout } = await execFile('pdftotext', ['-layout', filename, '-']);
    const parsed = parseAirbnbBookingPdfText(stdout);
    assert.match(parsed.conversationEntries[0].body, /🎉/u);
    assert.equal(parsed.reservation.arrival, '2026-09-04');
    assert.equal(parsed.reservation.departure, '2026-09-06');
    assert.equal(parsed.reservation.checkInTime, '16:00:00');
    assert.equal(parsed.reservation.checkOutTime, '10:00:00');
    assert.equal(parsed.conversationEntries[0].timestampPrecision, 'date_inferred');
    assert.equal(parsed.conversationEntries[0].sentAt, '2026-04-30 17:45:00 Europe/London');
    assert.equal(parsed.conversationEntries[1].sentAt, '2026-09-01 00:00:00 Europe/London');
    assert.ok(parsed.financialSummaries.every(item => item.arithmeticStatus === 'verified'));
    for (const [range, arrival, departure] of [
      ['30 Sept–2 Oct', '2026-09-30', '2026-10-02'],
      ['31 Dec–2 Jan', '2026-12-31', '2027-01-02'],
    ]) {
      const changed = parseAirbnbBookingPdfText(stdout.replace('4–6 Sept', range));
      assert.equal(changed.reservation.arrival, arrival);
      assert.equal(changed.reservation.departure, departure);
    }
    assert.throws(() => parseAirbnbBookingPdfText(stdout.replace('4–6 Sept', '31–33 Sept')));
  } finally { await browser.close(); await fs.rm(directory, { recursive: true, force: true }); }
});


test('generic page headings use the reservation guest identity and reject missing evidence', async () => {
  const { resolveBookingHeading, renderBookingHtml } = await import('../../site/scripts/generate-airbnb-message-booking-html.mjs');
  assert.equal(resolveBookingHeading('Messages', booking.reservation.visibleText), 'Example Guest');
  assert.equal(resolveBookingHeading('Inbox', booking.reservation.visibleText.replace('Guests', 'Who’s coming')), 'Example Guest');
  assert.equal(resolveBookingHeading('Custom Guest', booking.reservation.visibleText), 'Custom Guest');
  for (const text of ['Guests\n6 adults', 'Guests\nCancellation policy', 'Reservation only', 'Guests\nA Guest\nGuests\nAnother Guest']) {
    assert.throws(() => resolveBookingHeading('Messages', text));
  }
  const invalid = structuredClone(booking);
  invalid.conversation.heading = 'Messages';
  assert.throws(() => renderBookingHtml(invalid), /generic conversation heading/);
});

test('default reservation selector captures the current Airbnb panel and resolves the guest heading', { timeout: 20_000 }, async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  try {
    await context.route('https://www.airbnb.com/**', route => route.fulfill({ contentType: 'text/html', body: bookingPage().replace('<h1>Example Guest</h1>', '<h1>Messages</h1>').replace('<aside ', '<section id="thread_details_panel" data-testid="orbital-panel-details" ').replace('</aside>', '</section>') }));
    const capture = await capturePage(await context.newPage(), 'bookings', sourceIdentity('bookings', booking.source.url), {
      ...defaultSelectors, messageScroller: '#messages',
    });
    assert.equal(capture.conversation.heading, 'Example Guest');
  } finally { await browser.close(); }
});


test('service message labels accept Sent at without omitting the service event', async () => {
  const { parseMessageGroup } = await import('../../site/scripts/generate-airbnb-message-booking-html.mjs');
  const parsed = parseMessageGroup({ index: 1, accessibleLabel: 'Airbnb service says Booking confirmed · 1 guest, 11–13 Sept. Sent at 13 Jun, 18:34', visibleText: 'Booking confirmed · 1 guest, 11–13 Sept' });
  assert.equal(parsed.sender, 'Airbnb service');
  assert.equal(parsed.sentDate, '13 Jun');
  assert.equal(parsed.sentTime, '18:34');
  assert.equal(parsed.body, 'Booking confirmed · 1 guest, 11–13 Sept');
});

test('PDF batch continues after an unparseable record and retries it without duplicating completed PDFs', { timeout: 60_000 }, async () => {
  const run = `fixture-batch-${process.pid}-${Date.now()}`;
  const rawRoot = path.join(root, '.airbnb-capture/runs', run);
  const pdfRoot = path.join(root, 'output/pdf/airbnb-terminal', run);
  const directory = path.join(rawRoot, 'bookings');
  const ids = ['8000000001', '8000000002', '8000000003'];
  const args = ['site/scripts/capture-airbnb.mjs', 'render', '--kind', 'bookings', '--run', run, '--channel', 'chromium'];
  try {
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    for (const id of ids) {
      const capture = structuredClone(booking);
      capture.source.conversationId = id;
      if (id === ids[1]) capture.reservation.visibleText = 'Unparseable reservation fixture';
      await fs.writeFile(path.join(directory, `${id}.json`), JSON.stringify(capture), { mode: 0o600 });
    }
    await assert.rejects(execFile(process.execPath, args, { cwd: root }), error => {
      assert.equal(error.code, 1);
      assert.match(error.stdout, /2\/3 verified; 1 failed/u);
      assert.match(error.stderr, /Continuing with remaining items/u);
      assert.doesNotMatch(error.stdout + error.stderr, /Unparseable fixture label|Example Guest/u);
      return true;
    });
    const manifest = JSON.parse(await fs.readFile(path.join(directory, 'manifest.json')));
    assert.deepEqual(ids.map(id => manifest.items[id].status), ['complete', 'failed', 'complete']);
    await assert.rejects(fs.stat(path.join(pdfRoot, 'bookings', `${ids[1]}.pdf`)), { code: 'ENOENT' });
    await fs.stat(path.join(directory, `${ids[1]}.json`));
    await fs.stat(path.join(directory, `${ids[1]}.error.txt`));
    const preserved = await fs.readFile(path.join(pdfRoot, 'bookings', `${ids[2]}.pdf`));
    const saved = await fs.readFile(path.join(directory, `${ids[1]}.json`), 'utf8');
    const bad = JSON.parse(saved);
    bad.reservation.visibleText = booking.reservation.visibleText;
    // A deliberate fixture repair establishes its new raw hash just as an audited repair does.
    const repaired = JSON.stringify(bad);
    const { createHash } = await import('node:crypto');
    manifest.items[ids[1]].rawSha256 = createHash('sha256').update(repaired).digest('hex');
    await fs.writeFile(path.join(directory, `${ids[1]}.json`), repaired);
    await fs.writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest));
    const retry = await execFile(process.execPath, args, { cwd: root });
    assert.match(retry.stdout, /3\/3 verified; 0 failed/u);
    assert.deepEqual(await fs.readFile(path.join(pdfRoot, 'bookings', `${ids[2]}.pdf`)), preserved);
    await assert.rejects(fs.stat(path.join(directory, `${ids[1]}.error.txt`)), { code: 'ENOENT' });
  } finally {
    await fs.rm(rawRoot, { recursive: true, force: true });
    await fs.rm(pdfRoot, { recursive: true, force: true });
  }
});


test('message-only failures produce flagged PDFs without bypassing reservation or financial validation', { timeout: 30_000 }, async () => {
  const { parseAirbnbBookingPdfText } = await import('../../site/src/lib/airbnb-import/booking-pdf.ts');
  const browser = await chromium.launch({ headless: true });
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'airbnb-incomplete-'));
  try {
    const context = await browser.newContext();
    const capture = structuredClone(booking);
    capture.conversation.groups[0].accessibleLabel = 'Unparseable message';
    const raw = JSON.stringify(capture);
    const filename = path.join(directory, 'partial.pdf');
    const result = await writeVerifiedPdf(context, 'bookings', capture, filename);
    assert.equal(result.conversationStatus, 'incomplete');
    assert.equal(JSON.stringify(capture), raw);
    const { stdout } = await execFile('pdftotext', ['-layout', filename, '-']);
    const parsed = parseAirbnbBookingPdfText(stdout);
    assert.equal(parsed.conversationCompleteness.capturedMessageCount, 2);
    assert.equal(parsed.conversationEntries.length, 0);
    assert.equal(parsed.reservation.sourceStatusText, null);
    assert.ok(parsed.financialSummaries.every(item => item.arithmeticStatus === 'verified'));
    assert.match(stdout, /Conversation unavailable/);
    assert.doesNotMatch(stdout, /Complete conversation/);
    const changed = structuredClone(capture); changed.conversation.groups[0].visibleText += ' tampered';
    assert.throws(() => verifyPdfText('bookings', changed, stdout), /evidence differs/);
    assert.throws(() => parseAirbnbBookingPdfText(stdout.replace('Messages omitted: 2', 'Messages omitted: 0')));
    const badStay = structuredClone(capture); badStay.reservation.visibleText = 'Unparseable reservation';
    await assert.rejects(writeVerifiedPdf(context, 'bookings', badStay, path.join(directory, 'bad-stay.pdf')));
    const badMoney = structuredClone(capture); badMoney.earnings.tabs[0].text = badMoney.earnings.tabs[0].text.replace('£100.00', '£101.00');
    await assert.rejects(writeVerifiedPdf(context, 'bookings', badMoney, path.join(directory, 'bad-money.pdf')));
    await assert.rejects(fs.stat(path.join(directory, 'bad-money.pdf')), { code: 'ENOENT' });
  } finally { await browser.close(); await fs.rm(directory, { recursive: true, force: true }); }
});


test('accessible star labels and visible scores are consumed together, including four-star ratings', () => {
  const args = { reviewId: '9000000001', capturedAt: '2026-09-01T12:00:00Z' };
  const duplicated = reviewText.replace(/Rating, ([1-5]) stars/gu, '$1 stars\n$1');
  const parsed = parseReviewDialog({ ...args, text: duplicated });
  assert.equal(parsed.publicReview.rating, 4);
  assert.equal(parsed.publicReview.text, 'A comfortable stay. The garden was lovely.');
  assert.equal(parsed.detailedRatings[1].rating, 4);
  assert.deepEqual(parsed.detailedRatings[0].feedback, ['Clear instructions']);
  assert.deepEqual(parsed.detailedRatings[1].feedback, []);
  for (const label of ['Public review ★4', 'Public review *4']) {
    assert.equal(parseReviewDialog({ ...args, text: duplicated.replace('Public review\n4 stars', label) }).publicReview.text, parsed.publicReview.text);
  }
  assert.throws(() => parseReviewDialog({ ...args, text: duplicated.replace('4 stars\n4', '4 stars\n5') }), /disagree/);
  const numbered = duplicated.replace('A comfortable stay.', '5 people had a comfortable stay.');
  assert.ok(parseReviewDialog({ ...args, text: numbered }).publicReview.text.startsWith('5 people'));
  const numericOnly = reviewText.replace('Rating, 4 stars', '4');
  assert.equal(parseReviewDialog({ ...args, text: numericOnly }).publicReview.text, parsed.publicReview.text);
});
