import { LocalGuideError, type LocalGuideActor, type LocalGuideContentInput } from './types.ts';

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function text(value: unknown, field: string, max: number, required = false): string {
  if (typeof value !== 'string') {
    if (!required && value == null) return '';
    throw new LocalGuideError('VALIDATION_ERROR', `${field} must be text.`);
  }
  const clean = value.trim();
  if ((required && !clean) || clean.length > max) {
    throw new LocalGuideError('VALIDATION_ERROR', `${field} must contain ${required ? `between 1 and ${max}` : `at most ${max}`} characters.`);
  }
  return clean;
}

export function validateAdminActor(actor: LocalGuideActor): LocalGuideActor {
  if (actor.type !== 'administrator' || !/^\d+$/.test(actor.adminUserId)) {
    throw new LocalGuideError('VALIDATION_ERROR', 'A valid administrator actor is required.');
  }
  return { ...actor, source: text(actor.source ?? 'admin', 'Source', 100, true) };
}

export function validateSlug(value: string): string {
  const slug = text(value, 'Slug', 200, true).toLowerCase();
  if (!slugPattern.test(slug)) throw new LocalGuideError('VALIDATION_ERROR', 'Slug is invalid.');
  return slug;
}

export function validatePublicId(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new LocalGuideError('VALIDATION_ERROR', 'Local Guide entry identifier is invalid.');
  }
  return value;
}

function optionalUrl(value: string | null | undefined): string | null {
  const clean = text(value, 'External link', 2000);
  if (!clean) return null;
  let parsed: URL;
  try { parsed = new URL(clean); } catch { throw new LocalGuideError('VALIDATION_ERROR', 'External link must be a valid URL.'); }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new LocalGuideError('VALIDATION_ERROR', 'External link must use HTTP or HTTPS.');
  return clean;
}

export function validateContent(input: LocalGuideContentInput): Required<Omit<LocalGuideContentInput, 'categoryLabel' | 'imagePath' | 'externalLink' | 'legacyText'>> & {
  categoryLabel: string | null; imagePath: string | null; externalLink: string | null; legacyText: string | null;
} {
  const categoryId = text(input.categoryId, 'Category', 200, true);
  const imagePath = text(input.imagePath, 'Image path', 1000) || null;
  if (imagePath && !(imagePath.startsWith('/') || /^https:\/\//i.test(imagePath))) {
    throw new LocalGuideError('VALIDATION_ERROR', 'Image path must be root-relative or use HTTPS.');
  }
  return {
    title: text(input.title, 'Title', 200, true),
    summary: text(input.summary, 'Summary', 1000),
    markdownBody: input.markdownBody == null ? '' : typeof input.markdownBody === 'string' && input.markdownBody.length <= 100000
      ? input.markdownBody : (() => { throw new LocalGuideError('VALIDATION_ERROR', 'Markdown body must contain at most 100000 characters.'); })(),
    categoryId,
    categoryLabel: text(input.categoryLabel, 'Category label', 200) || null,
    imagePath,
    externalLink: optionalUrl(input.externalLink),
    recommended: input.recommended === true,
    legacyText: text(input.legacyText, 'Legacy text', 5000) || null,
  };
}
