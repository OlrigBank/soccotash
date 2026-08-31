import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  formatBaseNightlyPrice,
  getPublishedBaseNightlyPrices,
} from '../../src/lib/pricing/public-base-prices.ts';

const source = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('published base prices are selected in one query and retain missing arrangements', async () => {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const database = {
    async query(sql: string, values: unknown[]) {
      calls.push({ sql, values });
      return {
        rows: [
          { property_id: 'main-house', currency: 'GBP', amount_pence: '39500' },
          { property_id: 'whole-property', currency: 'GBP', amount_pence: '59500' },
        ],
      };
    },
  };

  const prices = await getPublishedBaseNightlyPrices(
    ['main-house', 'whole-property', 'cottage'],
    database as never,
  );

  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /p\.status = 'published'/);
  assert.match(calls[0].sql, /r\.enabled = TRUE/);
  assert.match(calls[0].sql, /r\.type = 'default_nightly_price'/);
  assert.deepEqual(calls[0].values, [['main-house', 'whole-property', 'cottage']]);
  assert.deepEqual(prices['main-house'], { currency: 'GBP', amountPence: 39500 });
  assert.deepEqual(prices['whole-property'], { currency: 'GBP', amountPence: 59500 });
  assert.equal(prices.cottage, null);
});

test('base nightly prices use guest-facing GBP formatting and a safe fallback', () => {
  assert.equal(formatBaseNightlyPrice({ currency: 'GBP', amountPence: 39500 }), '£395');
  assert.equal(formatBaseNightlyPrice({ currency: 'GBP', amountPence: 20050 }), '£200.50');
  assert.equal(formatBaseNightlyPrice(null), 'Ask for price');
});

test('the landing page uses published prices without hard-coded amounts', async () => {
  const homepage = await source('src/pages/index.astro');

  assert.match(homepage, /getPublishedBaseNightlyPrices\(comparedPropertyIds\)/);
  assert.match(homepage, /<th scope="row">Base price per night<\/th>/);
  assert.match(homepage, /baseNightlyPrices\['main-house'\]/);
  assert.match(homepage, /baseNightlyPrices\['whole-property'\]/);
  assert.match(homepage, /baseNightlyPrices\.cottage/);
  assert.doesNotMatch(homepage, /£395|£595|£200/);
  assert.match(homepage, /\.catch\(\(\) =>[\s\S]*propertyId, null/);
});
