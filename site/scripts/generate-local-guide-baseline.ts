import crypto from 'node:crypto';
import { access, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'yaml';

type Frontmatter = {
  title?: unknown; slug?: unknown; legacyId?: unknown; category?: unknown;
  categoryLabel?: unknown; image?: unknown; externalLink?: unknown;
  recommended?: unknown; summary?: unknown; legacyText?: unknown;
};

export type LocalGuideBaselineEntry = {
  contentId: string;
  filename: string;
  slug: string;
  legacyId: string | null;
  title: string;
  summary: string;
  legacyText: string;
  category: string;
  categoryLabel: string | null;
  image: string | null;
  externalLink: string | null;
  recommended: boolean;
  url: string;
  bodySha256: string;
};

export type LocalGuideBaseline = {
  version: 1;
  entryCount: number;
  recommendedCount: number;
  categoryCounts: Record<string, number>;
  entries: LocalGuideBaselineEntry[];
};

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const sha256Pattern = /^[a-f0-9]{64}$/;

export function validateRetiredLocalGuideBaseline(value: unknown): LocalGuideBaseline {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Retired Local Guide baseline must be an object.');
  const baseline = value as Partial<LocalGuideBaseline>;
  if (baseline.version !== 1 || !Number.isInteger(baseline.entryCount) || !Array.isArray(baseline.entries)) {
    throw new Error('Retired Local Guide baseline has an invalid version or entry count.');
  }
  if (baseline.entries.length !== baseline.entryCount) throw new Error('Retired Local Guide baseline entry count is inconsistent.');
  const slugs = new Set<string>();
  for (const entry of baseline.entries) {
    if (!entry || typeof entry !== 'object' || !slugPattern.test(entry.slug) || !sha256Pattern.test(entry.bodySha256)) {
      throw new Error('Retired Local Guide baseline contains an invalid entry.');
    }
    const slug = entry.slug.toLocaleLowerCase('en-GB');
    if (slugs.has(slug)) throw new Error(`Retired Local Guide baseline duplicates slug ${entry.slug}.`);
    slugs.add(slug);
  }
  return baseline as LocalGuideBaseline;
}

function requiredString(value: unknown, field: string, filename: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${filename}: ${field} is required.`);
  return value.trim();
}

function optionalString(value: unknown, field: string, filename: string): string | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') throw new Error(`${filename}: ${field} must be text.`);
  return value.trim() || null;
}

export function splitLocalGuideMarkdown(source: string, filename: string): { data: Frontmatter; body: string } {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);
  if (!match) throw new Error(`${filename}: valid YAML frontmatter is required.`);
  const data = parse(match[1]);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(`${filename}: frontmatter must be an object.`);
  return { data: data as Frontmatter, body: match[2] };
}

export async function buildLocalGuideBaseline(siteRoot = process.cwd()): Promise<LocalGuideBaseline> {
  const contentDirectory = path.join(siteRoot, 'src', 'content', 'local-guide');
  const navigation = parse(await readFile(path.join(siteRoot, 'src', 'data', 'navigation', 'main.yml'), 'utf8')) as {
    localGuideCategories?: Array<{ id?: unknown }>;
  };
  const categoryIds = new Set((navigation.localGuideCategories ?? []).map((item) => String(item.id ?? '')));
  const filenames = (await readdir(contentDirectory)).filter((name) => name.endsWith('.md')).sort();
  const slugs = new Map<string, string>();
  const entries: LocalGuideBaselineEntry[] = [];

  for (const filename of filenames) {
    const source = await readFile(path.join(contentDirectory, filename), 'utf8');
    const { data, body } = splitLocalGuideMarkdown(source, filename);
    const contentId = filename.replace(/\.md$/i, '');
    const slug = optionalString(data.slug, 'slug', filename) ?? contentId;
    if (!slugPattern.test(slug)) throw new Error(`${filename}: slug is invalid.`);
    const slugKey = slug.toLocaleLowerCase('en-GB');
    if (slugs.has(slugKey)) throw new Error(`${filename}: slug duplicates ${slugs.get(slugKey)}.`);
    if (categoryIds.has(slug)) throw new Error(`${filename}: slug collides with the ${slug} category route.`);
    slugs.set(slugKey, filename);

    const category = optionalString(data.category, 'category', filename) ?? 'local';
    if (!categoryIds.has(category)) throw new Error(`${filename}: category ${category} is not application-managed.`);
    if (data.recommended != null && typeof data.recommended !== 'boolean') {
      throw new Error(`${filename}: recommended must be boolean.`);
    }

    entries.push({
      contentId,
      filename,
      slug,
      legacyId: optionalString(data.legacyId, 'legacyId', filename),
      title: requiredString(data.title, 'title', filename),
      summary: optionalString(data.summary, 'summary', filename) ?? '',
      legacyText: optionalString(data.legacyText, 'legacyText', filename) ?? '',
      category,
      categoryLabel: optionalString(data.categoryLabel, 'categoryLabel', filename),
      image: optionalString(data.image, 'image', filename),
      externalLink: optionalString(data.externalLink, 'externalLink', filename),
      recommended: data.recommended === true,
      url: `/local-guide/${slug}/`,
      bodySha256: crypto.createHash('sha256').update(body).digest('hex'),
    });
  }

  entries.sort((left, right) => left.title.localeCompare(right.title, 'en-GB') || left.slug.localeCompare(right.slug));
  const categoryCounts = Object.fromEntries([...categoryIds].sort().map((id) => [id, entries.filter((entry) => entry.category === id).length]));
  return {
    version: 1,
    entryCount: entries.length,
    recommendedCount: entries.filter((entry) => entry.recommended).length,
    categoryCounts,
    entries,
  };
}

async function main() {
  const siteRoot = process.cwd();
  const outputPath = path.join(siteRoot, 'src', 'data', 'local-guide-baseline.json');
  if (process.argv.includes('--check')) {
    const contentDirectory = path.join(siteRoot, 'src', 'content', 'local-guide');
    const sourceRetired = await access(contentDirectory).then(() => false).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return true;
      throw error;
    });
    if (sourceRetired) {
      const existing = await readFile(outputPath, 'utf8');
      const baseline = validateRetiredLocalGuideBaseline(JSON.parse(existing));
      console.log(`Local Guide Markdown is retired; committed baseline evidence is valid for ${baseline.entryCount} entries.`);
      return;
    }
    const generated = `${JSON.stringify(await buildLocalGuideBaseline(siteRoot), null, 2)}\n`;
    const existing = await readFile(outputPath, 'utf8').catch(() => '');
    if (existing !== generated) throw new Error('Local Guide baseline is stale. Run npm run generate:local-guide-baseline.');
    console.log('Local Guide baseline is current.');
    return;
  }
  const generated = `${JSON.stringify(await buildLocalGuideBaseline(siteRoot), null, 2)}\n`;
  await writeFile(outputPath, generated, 'utf8');
  console.log(`Wrote ${outputPath}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
