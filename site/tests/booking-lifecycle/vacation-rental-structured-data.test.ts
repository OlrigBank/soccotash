import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { serializeStructuredData, vacationRentalStructuredData } from '../../src/lib/vacation-rental-structured-data.ts';

const site = new URL('https://olrig-bank.com');
const source = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Olrig Bank structured data matches its visible listing facts', () => {
  const data = vacationRentalStructuredData({
    site,
    slug: 'olrig-bank',
    identifier: 'olrig-bank:main-house',
    name: 'Olrig Bank',
    description: 'Spacious Kendal holiday accommodation sleeping eight adults.',
    sleeps: 'Sleeps 8 adults',
    bedrooms: '4 bedrooms',
    bathrooms: '2 bathrooms',
    imagePaths: ['/media/images/listings/house.jpeg', '/media/images/listings/house.jpeg'],
    hasGarden: true,
  });

  assert.equal(data['@context'], 'https://schema.org');
  assert.equal(data['@type'], 'VacationRental');
  assert.equal(data.identifier, 'olrig-bank:main-house');
  assert.equal(data.url, 'https://olrig-bank.com/listings/olrig-bank/');
  assert.deepEqual(data.image, ['https://olrig-bank.com/media/images/listings/house.jpeg']);
  assert.deepEqual(data.address, {
    '@type': 'PostalAddress', addressLocality: 'Kendal', addressRegion: 'Cumbria', addressCountry: 'GB',
  });
  assert.deepEqual(data.containsPlace.occupancy, { '@type': 'QuantitativeValue', value: 8, unitText: 'adults' });
  assert.equal(data.containsPlace.numberOfBedrooms, 4);
  assert.equal(data.containsPlace.numberOfBathroomsTotal, 2);
  assert.deepEqual(data.containsPlace.amenityFeature, [
    { '@type': 'LocationFeatureSpecification', name: 'Garden', value: true },
  ]);
});

test('structured data excludes private and unsupported claims', () => {
  const json = serializeStructuredData(vacationRentalStructuredData({
    site, slug: 'event', identifier: 'olrig-bank:whole-property', name: 'Olrig Bank Max',
    description: 'A Kendal holiday house.', sleeps: 'Sleeps 12 adults', bedrooms: '6 bedrooms',
    bathrooms: '3 bathrooms & 1 WC', imagePaths: ['/media/images/listings/olrigbank.png'], hasGarden: true,
  }));
  assert.doesNotMatch(json, /aggregateRating|review|email|telephone|booking\/manage|secure garden|wheelchair/i);
  assert.doesNotMatch(json, /latitude|longitude|postalCode|streetAddress/);
});

test('JSON-LD serialization is valid JSON and neutralizes closing script markup', () => {
  const serialized = serializeStructuredData({ description: '</script><script>alert(1)</script>' });
  assert.doesNotMatch(serialized, /<\/script>/i);
  assert.deepEqual(JSON.parse(serialized), { description: '</script><script>alert(1)</script>' });
});

test('listing route emits one inline JSON-LD block derived from listing and space data', async () => {
  const route = await source('src/pages/listings/[slug].astro');
  assert.match(route, /vacationRentalStructuredData\(\{/);
  assert.match(route, /identifier: `olrig-bank:\$\{bookingProperty\?\.id \?\? entry\.id\}`/);
  assert.match(route, /entry\.data\.description \?\? entry\.data\.summary/);
  assert.match(route, /selectedSpaces\.flatMap/);
  assert.match(route, /slot="head"[\s\S]*type="application\/ld\+json"[\s\S]*set:html=\{serializeStructuredData\(structuredData\)\}/);
  const layout = await source('src/layouts/BaseLayout.astro');
  assert.match(layout, /<slot name="head" \/>/);
});
