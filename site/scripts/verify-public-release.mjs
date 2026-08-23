const PRODUCTION_ORIGIN = 'https://olrig-bank.com';

export const REQUIRED_PATHS = [
  '/',
  '/listings/',
  '/listings/olrig-bank/',
  '/listings/event/',
  '/listings/cottage/',
  '/contact/',
];

export const STRUCTURED_DATA_PATHS = new Set([
  '/listings/olrig-bank/',
  '/listings/event/',
  '/listings/cottage/',
]);

function attribute(html, selector, attributeName) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tag = html.match(new RegExp(`<[^>]+${escapedSelector}[^>]*>`, 'i'))?.[0];
  return tag?.match(new RegExp(`${attributeName}=["']([^"']+)["']`, 'i'))?.[1] ?? '';
}

export function inspectPublicHtml(html, path) {
  const canonical = attribute(html, 'rel="canonical"', 'href');
  const title = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? '';
  const description = attribute(html, 'name="description"', 'content');
  const ogTitle = attribute(html, 'property="og:title"', 'content');
  const ogDescription = attribute(html, 'property="og:description"', 'content');
  const ogUrl = attribute(html, 'property="og:url"', 'content');
  const expectedCanonical = new URL(path, PRODUCTION_ORIGIN).href;
  const errors = [];

  if (!title) errors.push('missing title');
  if (!description) errors.push('missing meta description');
  if (canonical !== expectedCanonical) errors.push(`canonical is ${canonical || 'missing'}`);
  if (!ogTitle || !ogDescription) errors.push('incomplete Open Graph metadata');
  if (ogUrl !== expectedCanonical) errors.push(`Open Graph URL is ${ogUrl || 'missing'}`);

  const blocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  if (STRUCTURED_DATA_PATHS.has(path)) {
    if (blocks.length !== 1) {
      errors.push(`expected one JSON-LD block, found ${blocks.length}`);
    } else {
      try {
        const data = JSON.parse(blocks[0][1]);
        if (data['@type'] !== 'VacationRental') errors.push('JSON-LD is not VacationRental');
        if (data.url !== expectedCanonical) errors.push('JSON-LD URL does not match canonical');
      } catch {
        errors.push('JSON-LD is not valid JSON');
      }
    }
  }

  return { path, canonical, title, errors };
}

export function sitemapLocations(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
}

export function inspectDiscovery(sitemapXml, robotsText) {
  const locations = sitemapLocations(sitemapXml);
  const errors = [];
  if (!sitemapXml.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')) {
    errors.push('sitemap has no standard urlset');
  }
  if (new Set(locations).size !== locations.length) errors.push('sitemap contains duplicate URLs');
  for (const path of REQUIRED_PATHS) {
    const url = new URL(path, PRODUCTION_ORIGIN).href;
    if (!locations.includes(url)) errors.push(`sitemap omits ${url}`);
  }
  if (!robotsText.includes(`Sitemap: ${PRODUCTION_ORIGIN}/sitemap.xml`)) {
    errors.push('robots.txt does not name the production sitemap');
  }
  return { locations, errors };
}

function baseUrlFromArguments(arguments_) {
  const index = arguments_.indexOf('--base-url');
  const value = index >= 0 ? arguments_[index + 1] : PRODUCTION_ORIGIN;
  if (!value) throw new Error('--base-url requires a value');
  return new URL(value.endsWith('/') ? value : `${value}/`);
}

export async function verifyPublicRelease(baseUrl, fetcher = fetch) {
  const pageResults = [];
  for (const path of REQUIRED_PATHS) {
    const response = await fetcher(new URL(path.replace(/^\//, ''), baseUrl));
    if (!response.ok) {
      pageResults.push({ path, canonical: '', title: '', errors: [`HTTP ${response.status}`] });
      continue;
    }
    pageResults.push(inspectPublicHtml(await response.text(), path));
  }

  const [sitemapResponse, robotsResponse] = await Promise.all([
    fetcher(new URL('sitemap.xml', baseUrl)),
    fetcher(new URL('robots.txt', baseUrl)),
  ]);
  const discoveryErrors = [];
  if (!sitemapResponse.ok) discoveryErrors.push(`sitemap HTTP ${sitemapResponse.status}`);
  if (!robotsResponse.ok) discoveryErrors.push(`robots HTTP ${robotsResponse.status}`);
  const discovery = inspectDiscovery(
    sitemapResponse.ok ? await sitemapResponse.text() : '',
    robotsResponse.ok ? await robotsResponse.text() : '',
  );
  discovery.errors.unshift(...discoveryErrors);
  return { baseUrl: baseUrl.href, pageResults, discovery };
}

async function main() {
  const result = await verifyPublicRelease(baseUrlFromArguments(process.argv.slice(2)));
  for (const page of result.pageResults) {
    console.log(`${page.errors.length ? 'FAIL' : 'PASS'} ${page.path}${page.errors.length ? ` — ${page.errors.join('; ')}` : ''}`);
  }
  console.log(`${result.discovery.errors.length ? 'FAIL' : 'PASS'} /sitemap.xml and /robots.txt (${result.discovery.locations.length} sitemap URLs)`);
  for (const error of result.discovery.errors) console.log(`  ${error}`);
  if (result.pageResults.some((page) => page.errors.length) || result.discovery.errors.length) process.exitCode = 1;
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((error) => {
    console.error(`Public release verification failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
