export function isNoIndex(robots: string): boolean {
  return robots.split(',').some((directive) => directive.trim().toLowerCase() === 'noindex');
}

export function normalisePublicPath(pathname: string): string {
  const pathOnly = pathname.split(/[?#]/, 1)[0] || '/';
  const rooted = `/${pathOnly.replace(/^\/+/, '')}`;
  return rooted === '/' ? '/' : `${rooted.replace(/\/+$/, '')}/`;
}

export function productionUrl(site: URL, pathname: string): URL {
  const origin = new URL(site.href);
  origin.protocol = 'https:';
  origin.username = '';
  origin.password = '';
  origin.search = '';
  origin.hash = '';
  return new URL(normalisePublicPath(pathname), origin);
}

export function productionAssetUrl(site: URL, assetPath: string): URL {
  const base = productionUrl(site, '/');
  const supplied = new URL(assetPath, base);
  return new URL(`/${supplied.pathname.replace(/^\/+/, '')}`, base);
}
