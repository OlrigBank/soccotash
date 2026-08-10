import type { NavItem } from './navigation';
import { listPublishedLocalGuideEntries } from './local-guide/repository.ts';
import { categoriesAsNavigation,listPublishedLocalGuideCategories } from './local-guide/workspace.ts';
import type { LocalGuidePublishedEntry } from './local-guide/types.ts';

export type LocalGuideEntry = LocalGuidePublishedEntry & {
  urlSlug: string;
  categoryInfo: NavItem|undefined;
  data: {
    slug: string;
    title: string;
    summary: string;
    category: string;
    categoryLabel: string | null;
    image: string | null;
    externalLink: string | null;
    recommended: boolean;
    legacyText: null;
  };
};

const categoryFallbackSummaries: Record<string, string> = {
  'whats-on': 'Current ideas and event information for planning time in and around Kendal.',
  'close-to-home': 'A nearby place to explore during a stay at Olrig Bank.',
  'further-afield': 'A Lake District day-trip idea within reach of Kendal.',
  cycling: 'A cycling route or resource for exploring Kendal and the surrounding area.',
  'eating-out': 'A local place to eat in and around Kendal.', bars: 'A local place for drinks and an evening out in Kendal.',
  activities: 'An activity to consider during your stay in Kendal.', exhibitions: 'A local gallery, museum or exhibition venue.',
  shopping: 'An independent local shop in or around Kendal.', music: 'Live music or a music venue in Kendal.',
  antiques: 'A local destination for antiques and pre-owned finds.', collectables: 'A local destination for collectables and pre-owned finds.',
  festivals: 'A festival or recurring event associated with Kendal.', home: 'Information connected with Olrig Bank.',
};

function publicEntry(entry: LocalGuidePublishedEntry,categories:NavItem[]): LocalGuideEntry {
  return {
    ...entry,
    urlSlug: entry.slug,
    categoryInfo: categories.find(category=>category.id===entry.categoryId),
    data: {
      slug: entry.slug, title: entry.title, summary: entry.summary, category: entry.categoryId,
      categoryLabel: entry.categoryLabel, image: entry.imagePath, externalLink: entry.externalLink,
      recommended: entry.recommended, legacyText: null,
    },
  };
}

export async function getLocalGuideEntries() {
  const [entries,categories]=await Promise.all([listPublishedLocalGuideEntries(),listPublishedLocalGuideCategories()]);const navigation=categoriesAsNavigation(categories);
  return entries.map(entry=>publicEntry(entry,navigation));
}

export async function getEntriesForCategory(categoryId: string, includeDescendants = true) {
  const [entries,categories]=await Promise.all([getLocalGuideEntries(),listPublishedLocalGuideCategories()]);const descendants:string[]=[];const visit=(parent:string)=>{for(const category of categories.filter(item=>item.parent===parent)){descendants.push(category.id);visit(category.id)}};if(includeDescendants)visit(categoryId);
  const categoryIds = new Set([categoryId,...descendants]);
  return entries.filter((entry) => categoryIds.has(entry.categoryId));
}

export async function getFeaturedLocalGuideEntries(limit = 6) {
  const entries = await getLocalGuideEntries();
  const featured = entries.filter((entry) => entry.recommended);
  return (featured.length ? featured : entries).slice(0, limit);
}

export function entrySummary(entry: LocalGuideEntry) {
  return entry.summary.trim() || categoryFallbackSummaries[entry.categoryId] || 'Local information for guests staying at Olrig Bank.';
}
