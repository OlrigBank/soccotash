import { validateContent, validateSlug } from './validation.ts';

export const GUIDE_CLIPBOARD_KIND = 'olrig-bank-local-guide-entry';
export type CopiedGuideEntry = ReturnType<typeof validateContent> & { slug: string };

export function parseCopiedGuideEntry(text: string): CopiedGuideEntry | null {
  if (text.length > 140000) return null;
  try {
    const payload = JSON.parse(text);
    if (payload?.kind !== GUIDE_CLIPBOARD_KIND || payload.version !== 1 || !payload.entry || typeof payload.entry !== 'object') return null;
    return { ...validateContent(payload.entry), slug: validateSlug(payload.entry.slug) };
  } catch { return null; }
}

export function copyGuideEntryText(entry: Record<string, unknown>): string {
  const content = { ...validateContent(entry as Parameters<typeof validateContent>[0]), slug: validateSlug(entry.slug as string) };
  // Transfer content only: deployment-specific identifiers and revision numbers
  // must never make the destination overwrite an existing entry.
  return JSON.stringify({ kind: GUIDE_CLIPBOARD_KIND, version: 1, entry: content }, null, 2);
}
