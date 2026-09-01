import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const siteRoot = new URL('../../', import.meta.url);
const componentUrl = new URL('src/components/HomeGallery.astro', siteRoot);

type Photo = { src: string; alt: string; caption: string };

function parsePhotos(source: string, name: 'insidePhotos' | 'gardenPhotos'): Photo[] {
  const following = name === 'insidePhotos' ? 'const gardenPhotos' : 'const galleries';
  const block = source.slice(source.indexOf(`const ${name}`), source.indexOf(following));
  return [...block.matchAll(/\{ src: '([^']+)', alt: '([^']+)', caption: '([^']+)' \}/gu)]
    .map((match) => ({ src: match[1], alt: match[2], caption: match[3] }));
}

const expectedInside = [
  'house/house-hall/house-hall-1.jpeg',
  'house/house-lounge/house-lounge-1.jpeg',
  'house/house-lounge/house-lounge-2.jpeg',
  'house/house-lounge/house-lounge-3.jpeg',
  'house/house-dining/house-dining-1.jpeg',
  'house/house-kitchen/house-kitchen-1.jpeg',
  'house/house-kitchen/house-kitchen-2.jpeg',
  'house/house-bedroom-1/house-bedroom-1-1.jpeg',
  'house/house-bedroom-1/house-bedroom-1-2.jpeg',
  'house/house-bedroom-2/house-bedroom-2-1.jpeg',
  'house/house-bedroom-3/house-bedroom-3-1.jpeg',
  'house/house-bedroom-3/house-bedroom-3-2.jpeg',
  'house/house-bedroom-4/house-bedroom-4-1.jpeg',
  'house/house-bedroom-4/house-bedroom-4-2.jpeg',
  'house/house-bedroom-4/house-bedroom-4-3.jpeg',
  'house/house-bathroom-1/house-bathroom-1-1.jpeg',
  'house/house-bathroom-2/house-bathroom-2-1.jpeg',
  'house/house-bathroom-2/house-bathroom-2-2.jpeg',
  'cottage/cottage-lounge-1/cottage-lounge-1-1.jpeg',
  'cottage/cottage-kitchen-1/cottage-kitchen-1-1.jpeg',
  'cottage/cottage-bedroom-1/cottage-bedroom-1.jpeg',
  'cottage/cottage-bedroom-2/cottage-bedroom-2-1.jpeg',
  'cottage/cottage-bedroom-2/cottage-bedroom-2-2.jpeg',
  'cottage/cottage-bedroom-2/cottage-bedroom-2-3.jpeg',
  'cottage/cottage-bathroom-1/cottage-bathroom-1-1.jpeg',
  'cottage/cottage-wc-1/cottage-wc-1-1.jpeg',
  'cottage/cottage-hall-1/cottage-hall-1-1.jpeg',
  'cottage/cottage-landing-1/cottage-landing-1-1.jpeg',
  'cottage/cottage-mezzanine-1/cottage-mezzanine-1-1.jpeg',
].map((path) => `/media/images/spaces/${path}`);

const expectedGarden = [
  '753047a3-1a64-4783-9372-e2b7411b634e.jpeg',
  'fb82fcb3-02ad-482b-8ec0-72e4959303d2.jpeg',
  'dd595a45-a9f6-496c-bc89-d6fbda0a5dfe.jpeg',
  '9843d2d2-3a38-4315-ad9c-d786692bc650.jpeg',
  '386b6e75-15ef-4ed5-8854-b508443a808e.jpeg',
  '30a19f63-0d54-4ab6-a0b3-4e37582ebb19.jpeg',
  '603be396-a648-44d6-9d66-cd0a13969c6d.jpeg',
  '6a0a2e8f-fd49-4734-ae3b-2d058fdf7951.jpeg',
  'abfacbab-c4dc-4914-bce6-5ae41d0f5c97.jpeg',
].map((path) => `/media/images/spaces/garden/${path}`);

test('the home gallery exposes the complete ordered indoor and garden inventories', async () => {
  const source = await readFile(componentUrl, 'utf8');
  const inside = parsePhotos(source, 'insidePhotos');
  const garden = parsePhotos(source, 'gardenPhotos');
  assert.deepEqual(inside.map((photo) => photo.src), expectedInside);
  assert.deepEqual(garden.map((photo) => photo.src), expectedGarden);
  assert.equal(new Set([...inside, ...garden].map((photo) => photo.src)).size, 38);
  assert.ok(inside.every((photo) => photo.alt.trim() && photo.caption.trim()));
  assert.ok(garden.every((photo) => photo.alt.trim() && photo.caption.trim()));
  assert.ok(inside.slice(18).every((photo) => photo.alt.includes('Cottage') && photo.caption.startsWith('Cottage')));
  await Promise.all([...inside, ...garden].map((photo) => access(new URL(`public${photo.src}`, siteRoot))));
});

test('the home gallery renders exactly two independent accessible collections', async () => {
  const source = await readFile(componentUrl, 'utf8');
  assert.match(source, /heading: 'Inside Olrig Bank', photos: insidePhotos/u);
  assert.match(source, /heading: 'In the garden', photos: gardenPhotos/u);
  assert.match(source, /galleries\.map/u);
  assert.match(source, /data-home-gallery/u);
  assert.match(source, /data-gallery-count aria-live="polite"/u);
  assert.match(source, /data-gallery-previous/u);
  assert.match(source, /data-gallery-next/u);
  assert.match(source, /data-gallery-dialog/u);
  assert.match(source, /gallery\.querySelector\('\[data-gallery-rail\]'\)/u);
  assert.match(source, /rail\.scrollTo\(\{ left: card\.offsetLeft - rail\.offsetLeft, behavior: 'smooth' \}\)/u);
  assert.match(source, /dialog\.addEventListener\('close', \(\) => opener\?\.focus\(\)\)/u);
  assert.match(source, /event\.key === 'ArrowLeft'/u);
  assert.match(source, /event\.key === 'ArrowRight'/u);
  assert.match(source, /grid-auto-columns: 84%/u);
  assert.match(source, /grid-auto-columns: 48%/u);
  assert.match(source, /grid-auto-columns: 32%/u);
});
