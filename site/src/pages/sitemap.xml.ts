import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getLocalGuideEntries } from '../lib/content.ts';
import { listPublishedLocalGuideCategories } from '../lib/local-guide/workspace.ts';
import { listPublishedExamplePlans } from '../lib/planner/repository.ts';
import { sitemapPaths, sitemapXml } from '../lib/sitemap.ts';

export const prerender = false;

export const GET: APIRoute = async ({ site }) => {
  try {
    const [pages, listings, categories, entries, plans] = await Promise.all([
      getCollection('pages'),
      getCollection('listings'),
      listPublishedLocalGuideCategories(),
      getLocalGuideEntries(),
      listPublishedExamplePlans(),
    ]);
    const paths = sitemapPaths({
      pageIds: pages.map((entry) => entry.id),
      listingSlugs: listings.map((entry) => entry.data.slug ?? entry.id),
      localGuideCategoryIds: categories.map((category) => category.id),
      localGuideEntrySlugs: entries.map((entry) => entry.urlSlug),
      holidayPlanSlugs: plans.map((plan) => plan.publicSlug).filter((slug): slug is string => Boolean(slug)),
    });
    return new Response(sitemapXml(site ?? new URL('https://olrig-bank.com'), paths), {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch (error) {
    console.error('Public sitemap generation failed.', { cause: error instanceof Error ? error.name : 'unknown' });
    return new Response('Sitemap temporarily unavailable.\n', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
};
