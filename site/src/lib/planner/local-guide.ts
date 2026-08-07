import { PlannerError } from './types.ts';
import { LocalGuideError } from '../local-guide/types.ts';
import { listPublishedLocalGuideEntries, resolvePublishedLocalGuideSlug } from '../local-guide/repository.ts';

export type PlannerGuideEntry = {
  id: string; slug: string; title: string; summary: string; category: string; recommended: boolean;
  externalLink: string | null; image: string | null;
};

export async function getPlannerGuideEntries(): Promise<PlannerGuideEntry[]> {
  return (await listPublishedLocalGuideEntries()).map((entry) => ({
    id: entry.id, slug: entry.slug, title: entry.title, summary: entry.summary,
    category: entry.categoryId, recommended: entry.recommended,
    externalLink: entry.externalLink, image: entry.imagePath,
  })).sort((a,b)=>a.title.localeCompare(b.title,'en-GB'));
}

export async function requirePlannerGuideEntry(entryId: string): Promise<PlannerGuideEntry> {
  try {
    const entry=(await getPlannerGuideEntries()).find(candidate=>candidate.id===entryId);
    if(!entry) throw new PlannerError('VALIDATION_ERROR','The selected Local Guide entry is unavailable.');
    return entry;
  } catch (error) {
    if (error instanceof LocalGuideError) throw new PlannerError('VALIDATION_ERROR','The selected Local Guide entry is unavailable.');
    throw error;
  }
}

export async function requirePlannerGuideSlug(slug: string): Promise<PlannerGuideEntry> {
  const resolved = await resolvePublishedLocalGuideSlug(slug);
  if (!resolved) throw new PlannerError('VALIDATION_ERROR','The selected Local Guide entry is unavailable.');
  const entry = resolved.entry;
  return { id:entry.id,slug:entry.slug,title:entry.title,summary:entry.summary,category:entry.categoryId,
    recommended:entry.recommended,externalLink:entry.externalLink,image:entry.imagePath };
}
