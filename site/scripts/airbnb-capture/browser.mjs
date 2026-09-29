import { resolveBookingHeading } from '../generate-airbnb-message-booking-html.mjs';
import { appendMessageWindow, parseReviewDialog, sourceIdentity } from './records.mjs';

// Airbnb's host interface is not a stable API. These are deliberately bounded,
// readable selectors; --selectors permits adjustments without changing a run's data.
export const defaultSelectors = {
  reviewDialog: '[role="dialog"]',
  reservation: '#thread_details_panel, [data-testid="orbital-panel-details"]',
  conversationHeading: 'h1',
  messageGroups: '[role="group"][aria-label*=". Sent "]',
  messageScroller: null,
};

export async function populated(locator, timeout = 30_000) {
  await locator.waitFor({ state: 'visible', timeout });
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const text = (await locator.innerText()).trim();
    if (text) return text;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Displayed content did not populate.');
}

async function readReviewText(dialog) {
  return dialog.evaluate((element) => {
    // Read rendered content and accessible rating icons only; ignore hidden
    // duplicate layouts. No page scripts, network payloads or browser secrets.
    const walk = (node) => {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent;
      if (node.nodeType !== Node.ELEMENT_NODE) return '';
      if (/^(SCRIPT|STYLE)$/u.test(node.tagName) || node.hidden || getComputedStyle(node).display === 'none' || getComputedStyle(node).visibility === 'hidden') return '';
      const label = node.getAttribute('aria-label') || '';
      if (/^(?:Rating[,:]?\s*)?[1-5](?:\.0)?(?:\s*(?:out of 5|of 5))?\s*stars?[.,]?$/i.test(label)) return `\n${label}\n`;
      if (node.tagName === 'BUTTON' && /^(Close|Write a public reply|Show more|Show less)$/u.test(label || node.innerText.trim())) return '';
      const content = [...node.childNodes].map(walk).join('');
      return /^(DIV|P|H[1-6]|SECTION|LI|BR)$/u.test(node.tagName) ? `\n${content}\n` : content;
    };
    return walk(element);
  });
}

async function expandReadOnlyDetails(scope) {
  // Only expandable controls, never generic buttons (reply, cancel, etc.).
  for (let count = 0; count < 100; count += 1) {
    const closed = scope.locator('button[aria-expanded="false"]:visible');
    if (!await closed.count()) return;
    const control = closed.first();
    await control.click();
    await control.page().waitForFunction((element) => !element?.isConnected || element.getAttribute('aria-expanded') === 'true', await control.elementHandle());
  }
  throw new Error('Too many expandable detail rows.');
}

async function collectMessages(page, selectors) {
  const groups = page.locator(selectors.messageGroups);
  await groups.first().waitFor({ state: 'visible' });
  const scroller = selectors.messageScroller
    ? await page.locator(selectors.messageScroller).elementHandle()
    : await groups.first().evaluateHandle((element) => {
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        if (parent.scrollHeight > parent.clientHeight + 2 && /auto|scroll/u.test(getComputedStyle(parent).overflowY)) return parent;
      }
      return document.scrollingElement;
    });
  const read = () => groups.evaluateAll((elements) => elements.filter((element) => element.getClientRects().length).map((element) => ({
    accessibleLabel: element.getAttribute('aria-label'), visibleText: element.innerText,
  })));
  const state = () => scroller.evaluate((element) => ({ top: element.scrollTop, height: element.scrollHeight, viewport: element.clientHeight }));
  // Repeated top checks allow older history to load. A single scroll is insufficient.
  let stable = 0;
  let previous = '';
  for (let step = 0; step < 300 && stable < 3; step += 1) {
    await scroller.evaluate((element) => { element.scrollTop = Math.max(0, element.scrollTop - element.clientHeight * 0.65); });
    await page.waitForTimeout(400);
    const current = await state();
    const fingerprint = JSON.stringify([current, await read()]);
    stable = current.top <= 1 && fingerprint === previous ? stable + 1 : 0;
    previous = fingerprint;
  }
  if (stable < 3) throw new Error('Could not establish the start of the conversation.');
  let messages = [];
  stable = 0;
  previous = '';
  for (let step = 0; step < 1000 && stable < 3; step += 1) {
    const window = await read();
    if (!window.length) throw new Error('Conversation became empty while scrolling.');
    messages = appendMessageWindow(messages, window);
    const current = await state();
    const fingerprint = JSON.stringify([current, window]);
    stable = current.top + current.viewport >= current.height - 2 && fingerprint === previous ? stable + 1 : 0;
    previous = fingerprint;
    if (stable < 3) {
      await scroller.evaluate((element) => { element.scrollTop += element.clientHeight * 0.65; });
      await page.waitForTimeout(400);
    }
  }
  await scroller.dispose();
  if (stable < 3) throw new Error('Could not establish the end of the conversation.');
  return messages.map((group, index) => ({ ...group, index }));
}

export async function capturePage(page, kind, source, selectors = defaultSelectors, saveReviewSnapshot = async () => {}, knownReview, reservations) {
  await page.goto(source.url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(({ kind, id }) => {
    const url = new URL(location.href);
    return kind === 'reviews' ? url.searchParams.get('reviewId') === id : url.pathname.split('/').filter(Boolean).at(-1) === id;
  }, { kind, id: source.id });
  // A login or challenge redirect must not become a successful capture.
  if (sourceIdentity(kind, page.url()).id !== source.id) throw new Error('Airbnb navigation identity changed.');
  const capturedAt = new Date().toISOString();
  if (kind === 'reviews') {
    const dialog = page.locator(selectors.reviewDialog);
    await populated(dialog);
    const checkpoint = async () => {
      const snapshot = {
        schemaVersion: 1, capturedAt, source: { url: source.url, reviewId: source.id },
        dialogText: await readReviewText(dialog), renderedText: await dialog.innerText(),
      };
      // Await durable private storage before parsing. Diagnostic snapshots are
      // deliberately separate from successfully parsed, resumable captures.
      await saveReviewSnapshot(snapshot);
      return snapshot.dialogText;
    };
    // Retain evidence even if the expected ratings heading never appears.
    await checkpoint();
    await dialog.getByText('Detailed ratings', { exact: true }).waitFor({ state: 'visible' });
    const more = dialog.getByRole('button', { name: 'Show more', exact: true });
    for (let count = 0; count < 20 && await more.count(); count += 1) await more.first().click();
    if (await more.count()) throw new Error('Review still contains collapsed text.');
    const text = await checkpoint();
    return {
      schemaVersion: 1, capturedAt, source: { url: source.url, reviewId: source.id },
      dialogText: text,
      review: parseReviewDialog({ text, reviewId: source.id, capturedAt, knownReview, reservations }),
    };
  }
  const panel = page.locator(selectors.reservation);
  await populated(panel);
  await panel.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    for (const child of element.querySelectorAll('*')) {
      if (child.scrollHeight > child.clientHeight && /auto|scroll/u.test(getComputedStyle(child).overflowY)) child.scrollTop = child.scrollHeight;
    }
  });
  const earnings = page.getByRole('button', { name: 'Earnings', exact: true });
  await earnings.waitFor({ state: 'visible' });
  const displayedHeading = await populated(page.locator(selectors.conversationHeading));
  const groups = await collectMessages(page, selectors);
  const reservation = { visibleText: await populated(panel) };
  const heading = resolveBookingHeading(displayedHeading, reservation.visibleText);
  // Airbnb's amount card can cover the labelled Earnings button. Click the
  // visible card, as a person would, while retaining the older button layout.
  const paymentCard = panel.locator('[data-testid="hosting-details-payment-info"]');
  if (await paymentCard.isVisible()) await paymentCard.click();
  else await earnings.click();
  const dialog = page.getByRole('dialog').filter({ has: page.getByRole('tab', { name: 'You earn', exact: true }) });
  await dialog.waitFor({ state: 'visible' });
  const tabs = [];
  for (const name of ['You earn', 'Guest paid']) {
    const tab = dialog.getByRole('tab', { name, exact: true });
    await tab.click();
    await page.waitForFunction((element) => element?.getAttribute('aria-selected') === 'true', await tab.elementHandle());
    const content = dialog.getByRole('tabpanel').filter({ visible: true });
    await populated(content);
    await expandReadOnlyDetails(content);
    tabs.push({ name, text: await populated(content) });
  }
  return {
    schemaVersion: 1, capturedAt, source: { conversationId: source.id, url: source.url },
    conversation: { heading, groups }, reservation, earnings: { tabs },
  };
}
