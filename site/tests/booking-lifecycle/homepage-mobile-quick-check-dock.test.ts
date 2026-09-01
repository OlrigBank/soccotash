import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('the homepage replaces its phone booking link with one compact Quick Check dock', async () => {
  const [layout, homepage, component, publicTheme] = await Promise.all([
    source('src/layouts/BaseLayout.astro'),
    source('src/pages/index.astro'),
    source('src/components/CompactBookingPanel.astro'),
    source('src/styles/green-theme.css'),
  ]);

  assert.match(layout, /activePath === '\/'[\s\S]*mobile-contact-bar--quick-check[\s\S]*mobileDock=\{true\}/);
  assert.match(layout, /idPrefix="homepage-mobile-booking"[\s\S]*submitLabel="Quick Check"/);
  assert.match(layout, /\) : \([\s\S]*mobile-contact-bar__book[\s\S]*Check availability/);
  assert.match(homepage, /@media \(max-width: 699px\)[\s\S]*\.home-hero__content :global\(\.compact-booking-panel\)[\s\S]*display: none/);
  assert.match(component, /compact-booking-panel--mobile-dock/);
  assert.match(component, /grid-template-columns: minmax\(0, 1\.65fr\) minmax\(0, 0\.9fr\) minmax\(5\.25rem, 0\.8fr\)/);
  assert.match(component, /@media \(min-width: 700px\)[\s\S]*\.compact-booking-panel--mobile-dock[\s\S]*display: none/);
  assert.match(publicTheme, /:root:root\s*\{[\s\S]*--accent: #49654a;[\s\S]*--accent-dark: #314733;/);
});

test('mobile date, guest and result content use mutually exclusive upward-opening sheets', async () => {
  const component = await source('src/components/CompactBookingPanel.astro');

  assert.match(component, /type MobileSheet = 'date' \| 'guests' \| 'result'/);
  assert.match(component, /if \(activeMobileSheet && activeMobileSheet !== sheet\) closeMobileSheet\(false\)/);
  assert.match(component, /panel\.dataset\.openSheet = sheet/);
  assert.match(component, /bottom: calc\(4rem \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(component, /max-height: calc\(100dvh - 5rem - env\(safe-area-inset-bottom\)\)/);
  assert.match(component, /role=\{mobileDock \? 'dialog'/);
  assert.match(component, /aria-modal=\{mobileDock \? 'true'/);
  assert.match(component, /data-compact-sheet-close="date"/);
  assert.match(component, /data-compact-sheet-close="guests"/);
  assert.match(component, /data-compact-sheet-close="result"/);
  assert.match(component, /data-compact-sheet-backdrop/);
});

test('date and guest sheets distinguish completed selections from cancellation', async () => {
  const component = await source('src/components/CompactBookingPanel.astro');

  assert.match(component, /dateSnapshot = \{ arrival: arrival\.value, departure: departure\.value \}/);
  assert.match(component, /arrival\.value = dateSnapshot\.arrival[\s\S]*departure\.value = dateSnapshot\.departure/);
  assert.match(component, /if \(mobileDock\) closeMobileSheet\(true\)[\s\S]*setCalendarOpen\(false\)/);
  assert.match(component, /guestSnapshot = Object\.fromEntries/);
  assert.match(component, /input\.value = guestSnapshot\[input\.name\]/);
  assert.match(component, /data-compact-guests-done[\s\S]*closeMobileSheet\(true\)/);
  assert.match(component, /sheetBackdrop\?\.addEventListener\('click', \(\) => closeMobileSheet\(false\)\)/);
  assert.match(component, /event\.key === 'Escape' && activeMobileSheet[\s\S]*closeMobileSheet\(false\)/);
  assert.match(component, /event\.key === 'Tab' && activeMobileSheet[\s\S]*event\.shiftKey[\s\S]*last\.focus\(\)/);
  assert.match(component, /closingSheet === 'result' && action[\s\S]*action\.hidden = false/);
  assert.match(component, /returnTarget\?\.focus\(\{ preventScroll: true \}\)/);
});

test('every mobile Quick Check outcome is surfaced in the result sheet without changing continuation state', async () => {
  const component = await source('src/components/CompactBookingPanel.astro');

  assert.match(component, /new MutationObserver\(syncResponseSheet\)/);
  assert.match(component, /Boolean\(status\.textContent\?\.trim\(\)\) \|\| !result\.hidden/);
  assert.match(component, /openMobileSheet\('result', submit\)/);
  assert.match(component, /Those dates are unavailable/);
  assert.match(component, /Checking the latest availability and price/);
  assert.match(component, /Please try again or continue to the full request form/);
  assert.match(component, /\['propertyId', 'arrival', 'departure', 'adults', 'children', 'infants', 'pets'\]/);
});
