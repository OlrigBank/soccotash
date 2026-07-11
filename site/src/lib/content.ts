import { getCollection } from 'astro:content';
import { getCategoryById, getDescendantCategoryIds } from './navigation';

export type LocalGuideEntry = Awaited<ReturnType<typeof getLocalGuideEntries>>[number];

const categoryFallbackSummaries: Record<string, string> = {
  'whats-on': 'Current ideas and event information for planning time in and around Kendal.',
  'close-to-home': 'A nearby place to explore during a stay at Olrig Bank.',
  'further-afield': 'A Lake District day-trip idea within reach of Kendal.',
  cycling: 'A cycling route or resource for exploring Kendal and the surrounding area.',
  'eating-out': 'A local place to eat in and around Kendal.',
  bars: 'A local place for drinks and an evening out in Kendal.',
  activities: 'An activity to consider during your stay in Kendal.',
  exhibitions: 'A local gallery, museum or exhibition venue.',
  shopping: 'An independent local shop in or around Kendal.',
  music: 'Live music or a music venue in Kendal.',
  antiques: 'A local destination for antiques and pre-owned finds.',
  collectables: 'A local destination for collectables and pre-owned finds.',
  festivals: 'A festival or recurring event associated with Kendal.',
  home: 'Information connected with Olrig Bank.',
};

export async function getLocalGuideEntries() {
  const entries = await getCollection('localGuide');
  return entries
    .map((entry) => ({
      ...entry,
      urlSlug: entry.data.slug || entry.id,
      categoryInfo: getCategoryById(entry.data.category || ''),
    }))
    .sort((a, b) => a.data.title.localeCompare(b.data.title));
}

export async function getEntriesForCategory(categoryId: string, includeDescendants = true) {
  const entries = await getLocalGuideEntries();
  const categoryIds = new Set([
    categoryId,
    ...(includeDescendants ? getDescendantCategoryIds(categoryId) : []),
  ]);
  return entries.filter((entry) => categoryIds.has(entry.data.category || ''));
}

export async function getFeaturedLocalGuideEntries(limit = 6) {
  const entries = await getLocalGuideEntries();
  const featured = entries.filter((entry) => entry.data.recommended);
  return (featured.length ? featured : entries).slice(0, limit);
}

export function entrySummary(entry: LocalGuideEntry) {
  return (
    entry.data.summary?.trim() ||
    entry.data.legacyText?.trim() ||
    categoryFallbackSummaries[entry.data.category || ''] ||
    'Local information for guests staying at Olrig Bank.'
  );
}
