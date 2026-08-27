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

test('the listing opening puts the compact panel before imagery and removes duplicate booking prompts', async () => {
  const template = await source('src/pages/listings/[slug].astro');
  const opening = template.indexOf('class:list={["listing-opening"');
  const panel = template.indexOf('<CompactBookingPanel', opening);
  const image = template.indexOf('class="listing-hero-image"');

  assert.ok(opening >= 0 && panel > opening && image > panel);
  assert.doesNotMatch(template, />Check availability<\/a>/);
  assert.doesNotMatch(template, /<h2>Ask about a stay<\/h2>/);
  assert.match(template, /Message Jenna on WhatsApp/);
  assert.match(template, /@media \(min-width: 900px\)[\s\S]*grid-template-columns/);
});
