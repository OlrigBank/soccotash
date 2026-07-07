import { getCollection } from 'astro:content';
import { getCategoryById } from './navigation';

export type LocalGuideEntry = Awaited<ReturnType<typeof getLocalGuideEntries>>[number];

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

export async function getEntriesForCategory(categoryId: string) {
  const entries = await getLocalGuideEntries();
  return entries.filter((entry) => entry.data.category === categoryId);
}

export async function getFeaturedLocalGuideEntries(limit = 6) {
  const entries = await getLocalGuideEntries();
  const featured = entries.filter((entry) => entry.data.recommended);
  return (featured.length ? featured : entries).slice(0, limit);
}

export function entrySummary(entry: LocalGuideEntry) {
  return entry.data.summary || entry.data.legacyText || (entry as any).body?.trim() || entry.data.title;
}
