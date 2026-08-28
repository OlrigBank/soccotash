import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const componentUrl = new URL('../../src/components/CompactBookingPanel.astro', import.meta.url);

test('compact booking panel uses authoritative availability and quote APIs', async () => {
  const component = await readFile(componentUrl, 'utf8');
  assert.match(component, /fetch\(`\/api\/availability\/\?\$\{availabilityParams\}`\)/);
  assert.match(component, /fetch\('\/api\/quote\/'/);
  assert.doesNotMatch(component, /nightlyPrice|pricePerNight|calculatePrice/);
  assert.match(component, /These dates currently appear available/);
  assert.match(component, /provisional total/);
});

test('compact booking panel exposes honest unavailable, host-priced, error and bespoke states', async () => {
  const component = await readFile(componentUrl, 'utf8');
  assert.match(component, /Those dates are unavailable/);
  assert.match(component, /This is an indication, continue to get a confirmed quote/);
  assert.match(component, /Please try again or continue to the full request form/);
  assert.match(component, /Start a Bespoke request/);
  assert.match(component, /does not reserve or block the dates/);
  assert.doesNotMatch(component, />Reserve</);
  assert.doesNotMatch(component, />Book now</);
});

test('compact booking results are invalidated when booking inputs change', async () => {
  const component = await readFile(componentUrl, 'utf8');
  assert.match(component, /addEventListener\('input', clearResult\)/);
  assert.match(component, /property\.addEventListener\('change', updateMode\)/);
  assert.match(component, /result\.replaceChildren\(\)/);
});

test('compact booking analytics contain context and outcome but no private booking values', async () => {
  const component = await readFile(componentUrl, 'utf8');
  const analyticsCalls = component.match(/olrigAnalytics\?\.track\([\s\S]{0,220}?\);/g) ?? [];
  assert.ok(analyticsCalls.length >= 3);
  for (const call of analyticsCalls) {
    assert.doesNotMatch(call, /arrival|departure|adults|children|infants|pets|name|email|telephone/);
  }
});

test('compact panel only carries non-contact selections into the full form', async () => {
  const component = await readFile(componentUrl, 'utf8');
  assert.match(component, /\['propertyId', 'arrival', 'departure', 'adults', 'children', 'infants', 'pets'\]/);
  assert.doesNotMatch(component, /name="(?:name|email|telephone|message)"/);
});
