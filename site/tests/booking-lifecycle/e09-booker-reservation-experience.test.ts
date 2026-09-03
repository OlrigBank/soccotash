import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('the Booker header uses the public Olrig Bank identity within a private boundary', async () => {
  const layout = await source('src/layouts/BookerLayout.astro');
  assert.match(layout, /booker-brand__logo[\s\S]*olrig-bank-header-logo\.png/);
  assert.match(layout, /areaLabel = 'Private stay area'/);
  assert.match(layout, />Visit the public website/);
  assert.match(layout, /noindex,nofollow,noarchive/);
});

test('reservation workspaces keep visible current-state navigation', async () => {
  const page = await source('src/pages/booking/manage/[token]/index.astro');
  assert.match(page, /<h1>\{propertyName\}<\/h1>/);
  assert.match(page, /For \{offer\.guestName\}/);
  assert.match(page, /Booking overview/);
  for (const workspace of ['reservation', 'messages', 'holiday-planner']) {
    assert.ok(page.includes(`aria-current={workspace === '${workspace}' ? 'page' : undefined}`));
  }
  assert.match(page, />Messages<\/span>/);
  assert.match(page, /Your Reservation, Messages and Holiday Planner/);
  assert.doesNotMatch(page, /reservation, chat and Holiday Planner/);
  assert.doesNotMatch(page, /\{!workspace && <nav/);
});

test('F04 presentation retains private access and existing mutation boundaries', async () => {
  const page = await source('src/pages/booking/manage/[token]/index.astro');
  assert.match(page, /resolveBookingAccessCredential\(token/);
  assert.match(page, /Cache-Control', 'no-store, private'/);
  assert.match(page, /respondToCustomerBookingOffer/);
  assert.match(page, /reportManualBankTransfer/);
  assert.match(page, /createBookerBookingMessage/);
  assert.match(page, /cancelBookingByBookerToken/);
});
