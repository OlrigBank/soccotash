import assert from 'node:assert/strict';
import test from 'node:test';
import {
  inspectDiscovery,
  inspectPublicHtml,
  REQUIRED_PATHS,
} from '../../scripts/verify-public-release.mjs';

const canonical = 'https://olrig-bank.com/listings/olrig-bank/';
const validListing = `<!doctype html><html><head>
  <title>Olrig Bank | Kendal holiday accommodation</title>
  <meta name="description" content="Stay at Olrig Bank in Kendal">
  <link rel="canonical" href="${canonical}">
  <meta property="og:title" content="Olrig Bank">
  <meta property="og:description" content="Stay in Kendal">
  <meta property="og:url" content="${canonical}">
  <script type="application/ld+json">{"@type":"VacationRental","url":"${canonical}"}</script>
</head><body></body></html>`;

test('release verifier accepts complete canonical listing metadata', () => {
  assert.deepEqual(inspectPublicHtml(validListing, '/listings/olrig-bank/').errors, []);
});

test('release verifier reports canonical, social and structured-data failures', () => {
  const result = inspectPublicHtml('<html><head><title>Listing</title></head></html>', '/listings/olrig-bank/');
  assert.ok(result.errors.some((error) => error.includes('meta description')));
  assert.ok(result.errors.some((error) => error.includes('canonical')));
  assert.ok(result.errors.some((error) => error.includes('Open Graph')));
  assert.ok(result.errors.some((error) => error.includes('JSON-LD')));
});

test('release verifier checks required sitemap inventory, uniqueness and robots declaration', () => {
  const locations = REQUIRED_PATHS.map((path) => `<url><loc>${new URL(path, 'https://olrig-bank.com').href}</loc></url>`).join('');
  const valid = inspectDiscovery(
    `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${locations}</urlset>`,
    'User-agent: *\nAllow: /\nSitemap: https://olrig-bank.com/sitemap.xml\n',
  );
  assert.deepEqual(valid.errors, []);

  const invalid = inspectDiscovery('<urlset></urlset>', 'User-agent: *');
  assert.ok(invalid.errors.length >= REQUIRED_PATHS.length + 2);
});
