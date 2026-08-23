import { productionUrl } from './public-metadata.ts';

type SitemapInventory = {
  pageIds: string[];
  listingSlugs: string[];
  localGuideCategoryIds: string[];
  localGuideEntrySlugs: string[];
  holidayPlanSlugs: string[];
};

const publicSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function dynamicPaths(prefix: string, values: string[]): string[] {
  return values.filter((value) => publicSlug.test(value)).map((value) => `${prefix}${value}/`);
}

export function sitemapPaths(inventory: SitemapInventory): string[] {
  const contentPages = inventory.pageIds.flatMap((id) => {
    if (id === 'home') return ['/'];
    return publicSlug.test(id) ? [`/${id}/`] : [];
  });
  return [...new Set([
    ...contentPages,
    '/book/',
    '/listings/',
    ...dynamicPaths('/listings/', inventory.listingSlugs),
    '/local-guide/',
    ...dynamicPaths('/local-guide/', inventory.localGuideCategoryIds.filter((id) => id !== 'home')),
    ...dynamicPaths('/local-guide/', inventory.localGuideEntrySlugs),
    ...dynamicPaths('/holiday-plans/', inventory.holidayPlanSlugs),
  ])].filter((path) => path !== '/listings/main-house/').sort();
}

function escapeXml(value: string): string {
  return value.replace(/[<>&'\"]/g, (character) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;',
  })[character]!);
}

export function sitemapXml(site: URL, paths: string[]): string {
  const urls = [...new Set(paths)].sort().map((path) =>
    `  <url><loc>${escapeXml(productionUrl(site, path).href)}</loc></url>`,
  );
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}
