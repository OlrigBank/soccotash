import { pathToFileURL } from 'node:url';

const PRODUCTION_ORIGIN = 'https://olrig-bank.com';
export const REQUIRED_PATHS = [
  '/', '/listings/', '/listings/olrig-bank/', '/listings/event/',
  '/listings/cottage/', '/listings/bespoke/', '/contact/', '/book/', '/local-guide/',
];
export const GUIDE_REFERENCE_PATHS = ['/local-guide/activities/', '/local-guide/abbothall/'];
export const STRUCTURED_DATA_PATHS = new Set([
  '/listings/olrig-bank/', '/listings/event/', '/listings/cottage/',
]);

function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)]
    .map(([, name, double, single, bare]) => [name.toLowerCase(), double ?? single ?? bare]));
}
function tags(html, name) {
  return [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'gi'))].map(match => attributes(match[0]));
}
function metadata(html, name) {
  return tags(html, 'meta').filter(tag => (tag.name ?? tag.property ?? '').toLowerCase() === name).map(tag => tag.content ?? '');
}
function canonicalUrls(html) {
  return tags(html, 'link').filter(tag => tag.rel?.toLowerCase().split(/\s+/).includes('canonical')).map(tag => tag.href ?? '');
}
function robotDirectives(html, headers) {
  return [...metadata(html, 'robots'), ...metadata(html, 'googlebot'), headers.get('x-robots-tag') ?? '']
    .join(',').toLowerCase().split(/[\s,:]+/).filter(Boolean);
}
function preventsIndexing(html, headers) {
  return robotDirectives(html, headers).some(directive => ['noindex', 'none'].includes(directive));
}

export function inspectPublicHtml(html, path, headers = new Headers()) {
  const canonicals = canonicalUrls(html);
  const canonical = canonicals[0] ?? '';
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? '';
  const expectedCanonical = new URL(path, PRODUCTION_ORIGIN).href;
  const errors = [];
  if (!title) errors.push('missing title');
  if (!metadata(html, 'description')[0]) errors.push('missing meta description');
  if (canonicals.length !== 1 || canonical !== expectedCanonical) errors.push(`expected one canonical ${expectedCanonical}, found ${canonicals.join(', ') || 'none'}`);
  if (preventsIndexing(html, headers)) errors.push('indexing prohibited by robots metadata or response header');
  if (!metadata(html, 'og:title')[0] || !metadata(html, 'og:description')[0]) errors.push('incomplete Open Graph metadata');
  if (metadata(html, 'og:url')[0] !== expectedCanonical) errors.push('Open Graph URL does not match canonical');
  const blocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  if (STRUCTURED_DATA_PATHS.has(path)) {
    if (blocks.length !== 1) errors.push(`expected one JSON-LD block, found ${blocks.length}`);
    else {
      try {
        const data = JSON.parse(blocks[0][1]);
        if (data['@type'] !== 'VacationRental') errors.push('JSON-LD is not VacationRental');
        if (data.url !== expectedCanonical) errors.push('JSON-LD URL does not match canonical');
      } catch { errors.push('JSON-LD is not valid JSON'); }
    }
  }
  return { path, canonical, title, errors };
}

export function inspectGuideHtml(html, path, headers = new Headers()) {
  const errors = [];
  if (!preventsIndexing(html, headers)) errors.push('guide reference is missing noindex');
  if (robotDirectives(html, headers).some(directive => ['nofollow', 'none'].includes(directive))) errors.push('successful guide reference must permit following links');
  if (canonicalUrls(html).length) errors.push('excluded guide reference advertises a canonical');
  return { path, canonical: '', title: '', errors };
}

export function sitemapLocations(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'"));
}

function permittedSitemapUrl(value) {
  try {
    const url = new URL(value);
    return url.origin === PRODUCTION_ORIGIN && !url.username && !url.password && !url.search && !url.hash
      && !/^\/(?:admin|api|booking|planner)(?:\/|$)/.test(url.pathname)
      && !/^\/local-guide\/.+/.test(url.pathname)
      && url.pathname !== '/listings/main-house/' && url.pathname.endsWith('/');
  } catch { return false; }
}

// Evaluate the longest matching Allow/Disallow rule in the applicable Googlebot
// group (or wildcard group). This checks crawl access, independently of noindex.
export function allowsGooglebot(text, path) {
  const groups = [];
  let group;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split('#')[0].trim();
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const name = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (name === 'user-agent') {
      if (!group || group.hasRules) { group = { agents: [], rules: [], hasRules: false }; groups.push(group); }
      group.agents.push(value.toLowerCase());
    } else if (group && ['allow', 'disallow'].includes(name)) {
      group.hasRules = true;
      if (value) group.rules.push({ name, value });
    }
  }
  const specific = groups.filter(group => group.agents.includes('googlebot'));
  const applicable = specific.length ? specific : groups.filter(group => group.agents.includes('*'));
  const matching = applicable.flatMap(group => group.rules).filter(rule => {
    const end = rule.value.endsWith('$');
    const pattern = (end ? rule.value.slice(0, -1) : rule.value).split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
    return new RegExp(`^${pattern}${end ? '$' : ''}`).test(path);
  }).sort((a, b) => b.value.replace(/[*$]/g, '').length - a.value.replace(/[*$]/g, '').length || (a.name === 'allow' ? -1 : 1));
  return matching[0]?.name !== 'disallow';
}

export function inspectDiscovery(sitemapXml, robotsText) {
  const locations = sitemapLocations(sitemapXml);
  const errors = [];
  if (!sitemapXml.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')) errors.push('sitemap has no standard urlset');
  if (new Set(locations).size !== locations.length) errors.push('sitemap contains duplicate URLs');
  for (const path of REQUIRED_PATHS) {
    const url = new URL(path, PRODUCTION_ORIGIN).href;
    if (!locations.includes(url)) errors.push(`sitemap omits ${url}`);
  }
  for (const url of locations) if (!permittedSitemapUrl(url)) errors.push(`sitemap contains excluded or non-canonical URL: ${url}`);
  if (!robotsText.split(/\r?\n/).some(line => line.trim() === `Sitemap: ${PRODUCTION_ORIGIN}/sitemap.xml`)) errors.push('robots.txt does not name the production sitemap');
  const crawlPaths = new Set([...REQUIRED_PATHS, ...GUIDE_REFERENCE_PATHS, '/local-guide/future-reference/',
    ...locations.filter(permittedSitemapUrl).map(value => new URL(value).pathname)]);
  for (const path of crawlPaths) if (!allowsGooglebot(robotsText, path)) errors.push(`robots.txt blocks Googlebot from ${path}`);
  return { locations, errors };
}

function baseUrlFromArguments(arguments_) {
  const index = arguments_.indexOf('--base-url');
  const value = index >= 0 ? arguments_[index + 1] : PRODUCTION_ORIGIN;
  if (!value) throw new Error('--base-url requires a value');
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.pathname !== '/' || url.search || url.hash || url.username || url.password) throw new Error('--base-url must be an HTTP(S) origin without credentials');
  return url;
}

export async function verifyPublicRelease(baseUrl, fetcher = fetch) {
  const origin = new URL(baseUrl).origin;
  async function request(path) {
    try {
      return { response: await fetcher(new URL(path, origin), { redirect: 'manual', signal: AbortSignal.timeout(15000) }) };
    } catch (error) {
      return { error: `request unavailable (${error instanceof Error ? error.name : 'network error'})` };
    }
  }
  const pageResults = [];
  const checked = new Set();
  async function checkPage(path, reference = false) {
    checked.add(path);
    const { response, error } = await request(path);
    if (error || response.status !== 200) {
      pageResults.push({ path, canonical: '', title: '', errors: [error ?? `HTTP ${response.status}; expected 200 without redirect`] });
      return;
    }
    try {
      const html = await response.text();
      const result = reference ? inspectGuideHtml(html, path, response.headers) : inspectPublicHtml(html, path, response.headers);
      if (!response.headers.get('content-type')?.toLowerCase().includes('text/html')) result.errors.push('expected HTML content type');
      pageResults.push(result);
    } catch (error) {
      pageResults.push({ path, canonical: '', title: '', errors: [`response body unavailable (${error.name})`] });
    }
  }
  for (const path of REQUIRED_PATHS) await checkPage(path);
  for (const path of GUIDE_REFERENCE_PATHS) await checkPage(path, true);
  const discoveryErrors = [];
  async function readDiscovery(path, contentType) {
    const { response, error } = await request(path);
    if (error || response.status !== 200) { discoveryErrors.push(`${path}: ${error ?? `HTTP ${response.status}`}`); return ''; }
    if (!response.headers.get('content-type')?.toLowerCase().includes(contentType)) discoveryErrors.push(`${path}: expected ${contentType} content type`);
    try { return await response.text(); }
    catch (error) { discoveryErrors.push(`${path}: response body unavailable (${error.name})`); return ''; }
  }
  const [xml, robots] = await Promise.all([readDiscovery('/sitemap.xml', 'application/xml'), readDiscovery('/robots.txt', 'text/plain')]);
  const discovery = inspectDiscovery(xml, robots);
  discovery.errors.unshift(...discoveryErrors);
  // Only visit approved paths on the chosen target, never arbitrary sitemap origins.
  for (const url of new Set(discovery.locations)) {
    if (permittedSitemapUrl(url)) {
      const path = new URL(url).pathname;
      if (!checked.has(path)) await checkPage(path);
    }
  }
  const redirectPath = '/listings/main-house/';
  const { response, error } = await request(redirectPath);
  const redirectErrors = [];
  if (error) redirectErrors.push(error);
  else {
    if (![301, 308].includes(response.status)) redirectErrors.push(`expected permanent redirect, found HTTP ${response.status}`);
    const location = response.headers.get('location');
    try {
      const destination = new URL(location ?? '', new URL(redirectPath, origin));
      if (!location || ![origin, PRODUCTION_ORIGIN].includes(destination.origin) || destination.pathname !== '/listings/olrig-bank/' || destination.search || destination.hash) redirectErrors.push('redirect does not point directly to the preferred listing');
    } catch { redirectErrors.push('invalid redirect destination'); }
  }
  pageResults.push({ path: redirectPath, canonical: '', title: '', errors: redirectErrors });
  return { baseUrl: `${origin}/`, pageResults, discovery };
}

async function main() {
  const result = await verifyPublicRelease(baseUrlFromArguments(process.argv.slice(2)));
  for (const page of result.pageResults) console.log(`${page.errors.length ? 'FAIL' : 'PASS'} ${page.path}${page.errors.length ? ` — ${page.errors.join('; ')}` : ''}`);
  console.log(`${result.discovery.errors.length ? 'FAIL' : 'PASS'} /sitemap.xml and /robots.txt (${result.discovery.locations.length} sitemap URLs)`);
  for (const error of result.discovery.errors) console.log(`  ${error}`);
  if (result.pageResults.some(page => page.errors.length) || result.discovery.errors.length) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(`Public release verification failed: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; });
}
