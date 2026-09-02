import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const middlewareUrl = new URL('../../src/middleware.ts', import.meta.url);
const repositoryUrl = new URL('../../src/lib/airbnb-admin/repository.ts', import.meta.url);
const adminLayoutUrl = new URL('../../src/layouts/AdminLayout.astro', import.meta.url);
const routeUrls = [
  '../../src/pages/admin/airbnb/index.astro',
  '../../src/pages/admin/airbnb/reservations/index.astro',
  '../../src/pages/admin/airbnb/reservations/[id]/index.astro',
  '../../src/pages/admin/airbnb/reviews/index.astro',
  '../../src/pages/admin/airbnb/reviews/[id]/index.astro',
  '../../src/pages/admin/airbnb/reconciliation/index.astro',
  '../../src/pages/api/admin/airbnb/reconciliation/index.ts',
].map((path) => new URL(path, import.meta.url));

test('the complete admin surface emits private no-store and robot-blocking headers', async () => {
  const middleware = await readFile(middlewareUrl, 'utf8');
  assert.match(middleware, /privateAdminResponse/u);
  assert.match(middleware, /Cache-Control', 'private, no-store'/u);
  assert.match(middleware, /X-Robots-Tag', 'noindex, nofollow, noarchive'/u);
  assert.match(middleware, /if \(!isAdmin && !isAdminApi\) return next\(\)/u);
  assert.match(middleware, /isAdminApi.*Unauthorized/su);
});

test('Airbnb routes retain the shared authenticated layout and forbidden fields stay out of UI code', async () => {
  const [layout, repository, ...routes] = await Promise.all([
    readFile(adminLayoutUrl, 'utf8'),
    readFile(repositoryUrl, 'utf8'),
    ...routeUrls.map((url) => readFile(url, 'utf8')),
  ]);
  assert.match(layout, /meta name="robots" content="noindex,nofollow"/u);
  const renderedSurface = routes.join('\n');
  assert.doesNotMatch(renderedSurface, /access_code_ciphertext|accessCodeCiphertext|raw_extraction|rawExtraction|AIRBNB_IMPORT_ENCRYPTION_KEY/u);
  assert.doesNotMatch(repository, /SELECT\s+\*/iu);
  assert.doesNotMatch(repository, /console\.(?:log|info|debug).*guest|console\.(?:log|info|debug).*message/iu);
  assert.match(renderedSurface, /<AdminLayout/u);
});

test('public page sources do not import the private Airbnb administration repository', async () => {
  const publicRoutes = [
    '../../src/pages/index.astro',
    '../../src/pages/listings/index.astro',
    '../../src/pages/book.astro',
  ];
  const sources = await Promise.all(publicRoutes.map((path) => readFile(new URL(path, import.meta.url), 'utf8')));
  assert.doesNotMatch(sources.join('\n'), /lib\/airbnb-admin|airbnb_(?:reservations|reviews|messages|financial|source_documents)/u);
});
