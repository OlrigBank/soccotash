import assert from 'node:assert/strict';
import test from 'node:test';
import {
  inspectDiscovery,
  inspectPublicHtml,
  REQUIRED_PATHS,
  GUIDE_REFERENCE_PATHS,
  inspectGuideHtml,
  allowsGooglebot,
  verifyPublicRelease,
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

// Exercise response-level checks with a complete disposable site, rather than
// depending on the real site's deployment or Search Console account.
async function fixtureSite(path: string) {
  if (path === '/sitemap.xml') return new Response(`<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[...REQUIRED_PATHS, '/welcome/'].map(path => `<url><loc>https://olrig-bank.com${path}</loc></url>`).join('')}</urlset>`, { headers: { 'content-type': 'application/xml' } });
  if (path === '/robots.txt') return new Response('User-agent: *\nAllow: /\nSitemap: https://olrig-bank.com/sitemap.xml\n', { headers: { 'content-type': 'text/plain' } });
  if (path === '/listings/main-house/') return new Response(null, { status: 301, headers: { location: '/listings/olrig-bank/' } });
  const html = GUIDE_REFERENCE_PATHS.includes(path) ? '<meta name="robots" content="noindex,follow">'
    : validListing.replaceAll('/listings/olrig-bank/', path);
  return new Response(html, { headers: { 'content-type': 'text/html' } });
}

test('indexing prohibitions and repeated canonicals are rejected on public pages', () => {
  for (const tag of ['<meta content="NOINDEX,follow" name="robots">', '<meta name="googlebot" content="none">']) {
    assert.match(inspectPublicHtml(validListing + tag, '/listings/olrig-bank/').errors.join(), /indexing prohibited/);
  }
  assert.match(inspectPublicHtml(validListing, '/listings/olrig-bank/', new Headers({ 'x-robots-tag': 'googlebot: noindex' })).errors.join(), /indexing prohibited/);
  assert.match(inspectPublicHtml(validListing + `<link href="${canonical}" rel="canonical">`, '/listings/olrig-bank/').errors.join(), /expected one canonical/);
});

test('guide references require noindex and retain following links', () => {
  assert.deepEqual(inspectGuideHtml('<meta content="noindex,follow" name="robots">', GUIDE_REFERENCE_PATHS[0]).errors, []);
  assert.match(inspectGuideHtml('<title>Guide</title>', GUIDE_REFERENCE_PATHS[0]).errors.join(), /missing noindex/);
  assert.match(inspectGuideHtml('<meta name="robots" content="noindex,nofollow">', GUIDE_REFERENCE_PATHS[0]).errors.join(), /permit following/);
});

test('discovery rejects excluded paths, variants, duplicate URLs and crawler blocks', () => {
  const invalid = ['https://olrig-bank.com/local-guide/abbothall/', 'https://olrig-bank.com/admin/',
    'https://olrig-bank.com/api/availability/', 'https://olrig-bank.com/booking/', 'https://olrig-bank.com/planner/',
    'https://olrig-bank.com/listings/main-house/', 'https://www.olrig-bank.com/',
    'https://olrig-bank.com/contact/?source=test', 'https://olrig-bank.com/contact/#details', 'invalid'];
  const xml = `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[...REQUIRED_PATHS.map(path => `https://olrig-bank.com${path}`), ...invalid].map(url => `<url><loc>${url}</loc></url>`).join('')}</urlset>`;
  const result = inspectDiscovery(xml, 'User-agent: *\nDisallow: /local-guide/\nSitemap: https://olrig-bank.com/sitemap.xml');
  assert.equal(result.errors.filter(error => error.includes('excluded or non-canonical')).length, invalid.length);
  assert.match(result.errors.join(), /blocks Googlebot/);
});

test('crawl checks respect Googlebot groups, allow overrides and wildcard rules', () => {
  assert.equal(allowsGooglebot('User-agent: Googlebot\nDisallow:\nUser-agent: *\nDisallow: /', '/contact/'), true);
  assert.equal(allowsGooglebot('User-agent: *\nDisallow: /\nAllow: /local-guide/', '/local-guide/abbothall/'), true);
  assert.equal(allowsGooglebot('User-agent: *\nDisallow: /\nUser-agent: Googlebot\nAllow: /', '/contact/'), true);
  assert.equal(allowsGooglebot('User-agent: *\nDisallow: /local-guide/*\nAllow: /local-guide/$', '/local-guide/'), true);
  assert.equal(allowsGooglebot('User-agent: *\nDisallow: /local-guide/*\nAllow: /local-guide/$', '/local-guide/abbothall/'), false);
});

test('release verifier visits every sitemap destination without following redirects', async () => {
  const visited: string[] = [];
  const result = await verifyPublicRelease(new URL('http://127.0.0.1:9999'), async (input, options) => {
    assert.ok(input instanceof URL);
    assert.equal(input.origin, 'http://127.0.0.1:9999');
    assert.equal(options?.redirect, 'manual');
    visited.push(input.pathname);
    return fixtureSite(input.pathname);
  });
  assert.deepEqual(result.discovery.errors, []);
  assert.deepEqual(result.pageResults.flatMap(page => page.errors), []);
  assert.ok(visited.includes('/welcome/'));
});

test('release verifier reports redirects, header prohibitions, bad destinations and unavailable requests', async () => {
  const result = await verifyPublicRelease(new URL('http://127.0.0.1:9999'), async (input) => {
    assert.ok(input instanceof URL);
    const path = input.pathname;
    if (path === '/') return new Response(null, { status: 302, headers: { location: '/contact/' } });
    if (path === '/contact/') return new Response(validListing.replaceAll('/listings/olrig-bank/', path), { headers: { 'content-type': 'text/html', 'x-robots-tag': 'noindex' } });
    if (path === '/welcome/') throw new TypeError('Unavailable');
    if (path === '/listings/main-house/') return new Response(null, { status: 301, headers: { location: '/listings/cottage/' } });
    return fixtureSite(path);
  });
  assert.match(result.pageResults.find(page => page.path === '/')!.errors.join(), /HTTP 302/);
  assert.match(result.pageResults.find(page => page.path === '/contact/')!.errors.join(), /indexing prohibited/);
  assert.match(result.pageResults.find(page => page.path === '/welcome/')!.errors.join(), /request unavailable/);
  assert.match(result.pageResults.find(page => page.path === '/listings/main-house/')!.errors.join(), /preferred listing/);
});

test('untrusted sitemap destinations are reported without visiting their origins', async () => {
  const visited: string[] = [];
  const result = await verifyPublicRelease(new URL('http://127.0.0.1:9999'), async (input) => {
    assert.ok(input instanceof URL);
    visited.push(input.href);
    const response = await fixtureSite(input.pathname);
    if (input.pathname !== '/sitemap.xml') return response;
    return new Response((await response.text()).replace('</urlset>', '<url><loc>https://untrusted.example/private/</loc></url></urlset>'), { headers: response.headers });
  });
  assert.match(result.discovery.errors.join(), /untrusted\.example/);
  assert.ok(visited.every(value => new URL(value).origin === 'http://127.0.0.1:9999'));
});

test('unavailable discovery endpoints and non-HTML destinations fail verification', async () => {
  const result = await verifyPublicRelease(new URL('http://127.0.0.1:9999'), async (input) => {
    assert.ok(input instanceof URL);
    if (input.pathname === '/robots.txt') throw new TypeError('Unavailable');
    if (input.pathname === '/welcome/') return new Response(validListing.replaceAll('/listings/olrig-bank/', '/welcome/'), { headers: { 'content-type': 'application/json' } });
    return fixtureSite(input.pathname);
  });
  assert.match(result.discovery.errors.join(), /robots.txt: request unavailable/);
  assert.match(result.pageResults.find(page => page.path === '/welcome/')!.errors.join(), /HTML content type/);
});
