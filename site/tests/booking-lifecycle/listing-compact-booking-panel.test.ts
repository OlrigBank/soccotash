import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import YAML from 'yaml';

const source = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('standard listing pages use their configured immutable booking arrangement', async () => {
  const [template, propertiesSource, component] = await Promise.all([
    source('src/pages/listings/[slug].astro'),
    source('src/data/booking/properties.yml'),
    source('src/components/CompactBookingPanel.astro'),
  ]);
  const configuration = YAML.parse(propertiesSource) as {
    properties: Array<{ id: string; listingSlug: string; administratorPriced?: boolean }>;
  };
  const standardMappings = configuration.properties
    .filter((property) => !property.administratorPriced)
    .map(({ id, listingSlug }) => [listingSlug, id]);

  assert.deepEqual(standardMappings, [
    ['olrig-bank', 'main-house'],
    ['cottage', 'cottage'],
    ['event', 'whole-property'],
  ]);
  assert.match(template, /getProperties\(\)\.find\(\(property\) => property\.listingSlug === entry\.data\.slug\)/);
  assert.match(template, /<CompactBookingPanel[\s\S]*propertyId=\{bookingProperty\.id\}[\s\S]*source="listing"/);
  assert.match(component, /<input type="hidden" name="propertyId" value=\{fixedProperty\.id\}/);
});

test('the listing puts the main image before Quick Check and the description', async () => {
  const template = await source('src/pages/listings/[slug].astro');
  const image = template.indexOf('class="listing-hero-image"');
  const panel = template.indexOf('<CompactBookingPanel');
  const description = template.indexOf('class="hero listing-opening__description"');
  assert.ok(image >= 0 && panel > image && description > panel);
  assert.match(template, /quickCheck=\{true\}/);
  assert.match(template, /mobileDock=\{true\}/);
  assert.doesNotMatch(template, /<h2>Ask about a stay<\/h2>/);
  assert.match(template, /Message Jenna on WhatsApp/);
});
