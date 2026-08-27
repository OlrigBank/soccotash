import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import YAML from 'yaml';

const source = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('the Bespoke listing is fixed to the administrator-priced arrangement', async () => {
  const [propertiesSource, listingTemplate] = await Promise.all([
    source('src/data/booking/properties.yml'),
    source('src/pages/listings/[slug].astro'),
  ]);
  const configuration = YAML.parse(propertiesSource) as {
    properties: Array<{ id: string; listingSlug: string; administratorPriced?: boolean }>;
  };
  const bespoke = configuration.properties.find((property) => property.id === 'bespoke-arrangement');

  assert.equal(bespoke?.listingSlug, 'bespoke');
  assert.equal(bespoke?.administratorPriced, true);
  assert.match(listingTemplate, /const bespokeListing = bookingProperty\?\.id === 'bespoke-arrangement'/);
  assert.match(listingTemplate, /bespokeListing \? 'Tell us about your preferred stay'/);
});

test('Bespoke is rendered as an enquiry before JavaScript and bypasses live checking', async () => {
  const component = await source('src/components/CompactBookingPanel.astro');

  assert.match(component, /fixedBespoke \? 'Begin an enquiry' : 'Check a stay'/);
  assert.match(component, /fixedBespoke \? 'Start a Bespoke request' : 'Quick Check'/);
  assert.match(component, /data-compact-booking-bespoke hidden=\{!fixedBespoke\}/);
  assert.match(component, /This does not reserve or block the dates; Jenna will confirm the accommodation, availability and price/);

  const bespokeBranch = component.match(/if \(isBespoke\(\)\) \{([\s\S]*?)\n\s*\}\n\n\s*submit\.disabled/)?.[1] ?? '';
  assert.match(bespokeBranch, /Jenna will confirm the accommodation, availability and price/);
  assert.match(bespokeBranch, /continueLink\('Start a Bespoke request'\)/);
  assert.doesNotMatch(bespokeBranch, /fetch\(|appear available|guestTotalPence|pricingAvailable/);
});
