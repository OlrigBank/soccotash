import { getCollection } from 'astro:content';
import { PlannerError } from './types.ts';

export type PlannerGuideEntry = {
  slug: string; title: string; summary: string; category: string;
  externalLink: string | null; image: string | null;
};

export async function getPlannerGuideEntries(): Promise<PlannerGuideEntry[]> {
  const entries = await getCollection('localGuide');
  return entries.map((entry) => ({
    slug: entry.data.slug || entry.id.replace(/\.md$/i, ''), title: entry.data.title,
    summary: entry.data.summary || '', category: entry.data.category || 'local',
    externalLink: entry.data.externalLink || null, image: entry.data.image || null,
  })).sort((a,b)=>a.title.localeCompare(b.title,'en-GB'));
}

export async function requirePlannerGuideEntry(slug: string): Promise<PlannerGuideEntry> {
  const entry=(await getPlannerGuideEntries()).find(candidate=>candidate.slug===slug);
  if(!entry) throw new PlannerError('VALIDATION_ERROR','The selected Local Guide entry is unavailable.');
  return entry;
}
