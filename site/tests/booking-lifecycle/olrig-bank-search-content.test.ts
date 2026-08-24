import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import YAML from 'yaml';

const source = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

function listingData(markdown: string): Record<string, unknown> {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  assert.ok(match, 'Listing must begin with YAML front matter.');
  return YAML.parse(match[1]) as Record<string, unknown>;
}

test('Olrig Bank presents the agreed search content and guest qualifications', async () => {
  const listing = await source('src/content/listings/main-house.md');

  for (const heading of [
    'Spacious group accommodation in Kendal',
    'Walk into Kendal and explore the Lake District',
    'Large garden and off-road parking',
    'Designed for families and groups',
    'Frequently asked questions',
  ]) {
    assert.match(listing, new RegExp(`## ${heading}`));
  }

  assert.match(listing, /Sleeping eight adults across four bedrooms/);
  assert.match(listing, /four bedrooms, two bathrooms/);
  assert.match(listing, /driveway requires some care with larger vehicles/);
  assert.match(listing, /Bedroom arrangements can vary/);
  assert.doesNotMatch(listing, /secure garden|enclosed garden|three bathrooms/i);
});

test('Olrig Bank exposes five visible FAQ answers in Markdown', async () => {
  const listing = await source('src/content/listings/main-house.md');
  const questions = listing.match(/^### .+\?$/gm) ?? [];

  assert.equal(questions.length, 5);
  assert.match(listing, /How many guests can stay at Olrig Bank\?/);
  assert.match(listing, /Can guests walk into Kendal town centre\?/);
  assert.match(listing, /Is parking available\?/);
  assert.match(listing, /Is the house suitable for families\?/);
  assert.match(listing, /Is Olrig Bank a good base for the Lake District\?/);
});

test('listing hero images support descriptive alternative text with a title fallback', async () => {
  const [schema, route, listing, pages] = await Promise.all([
    source('src/content.config.ts'),
    source('src/pages/listings/[slug].astro'),
    source('src/content/listings/main-house.md'),
    source('../.pages.yml'),
  ]);

  assert.match(schema, /imageAlt: z\.string\(\)\.max\(240\)\.optional\(\)/);
  assert.match(route, /alt=\{entry\.data\.imageAlt \?\? entry\.data\.title\}/);
  assert.equal(listingData(listing).imageAlt, 'The stone front of Olrig Bank beneath a blue sky, viewed from Little Aynam');
  for (const field of ['seoTitle', 'description', 'heroEyebrow', 'heroTitle', 'imageAlt']) {
    assert.match(pages, new RegExp(`- name: ${field}\\b`));
  }
});

test('Olrig Bank and Olrig Bank Max present numbered bedrooms and floor-specific bathrooms', async () => {
  const [route, space] = await Promise.all([
    source('src/pages/listings/[slug].astro'),
    source('src/components/Space.astro'),
  ]);

  assert.match(route, /'cottage-bedroom-1': 'Bedroom 5'/);
  assert.match(route, /'cottage-bedroom-2': 'Bedroom 6'/);
  assert.match(route, /'house-bathroom-1': 'Upstairs Bathroom 1'/);
  assert.match(route, /'cottage-bathroom-1': 'Upstairs Bathroom 2'/);
  assert.match(route, /'house-bathroom-2': 'Downstairs Bathroom 1'/);
  assert.match(route, /displayTitle=\{presentation\.title\}/);
  assert.match(space, /displayTitle = space\.data\.title/);
  assert.match(space, /<h3>\{displayTitle\}<\/h3>/);
});
