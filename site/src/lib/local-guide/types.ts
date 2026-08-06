export const LOCAL_GUIDE_STATUSES = ['draft', 'published', 'unpublished', 'archived'] as const;
export type LocalGuideStatus = typeof LOCAL_GUIDE_STATUSES[number];

export type LocalGuideActor = {
  type: 'administrator';
  adminUserId: string;
  source?: string;
};

export type LocalGuideContentInput = {
  title: string;
  summary?: string;
  markdownBody?: string;
  categoryId: string;
  categoryLabel?: string | null;
  imagePath?: string | null;
  externalLink?: string | null;
  recommended?: boolean;
  legacyText?: string | null;
};

export type LocalGuideRevision = {
  id: string;
  revisionNumber: number;
  title: string;
  summary: string;
  markdownBody: string;
  bodyFormat: 'markdown';
  categoryId: string;
  categoryLabel: string | null;
  imagePath: string | null;
  externalLink: string | null;
  recommended: boolean;
  legacyText: string | null;
  actorType: 'system' | 'administrator' | 'contribution';
  source: string;
  action: string;
  createdAt: string;
};

export type LocalGuideEntry = {
  id: string;
  slug: string;
  legacyContentId: string | null;
  legacyId: string | null;
  status: LocalGuideStatus;
  lockVersion: number;
  workingRevisionId: string | null;
  publishedRevisionId: string | null;
  workingRevision: LocalGuideRevision | null;
  publishedRevision: LocalGuideRevision | null;
  publishedAt: string | null;
  unpublishedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LocalGuidePublishedEntry = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  markdownBody: string;
  categoryId: string;
  categoryLabel: string | null;
  imagePath: string | null;
  externalLink: string | null;
  recommended: boolean;
  revisionNumber: number;
  publishedAt: string;
};

export class LocalGuideError extends Error {
  readonly code: 'NOT_FOUND' | 'STALE_VERSION' | 'VALIDATION_ERROR' | 'INVALID_TRANSITION' | 'SLUG_CONFLICT';
  readonly currentVersion?: number;

  constructor(
    code: 'NOT_FOUND' | 'STALE_VERSION' | 'VALIDATION_ERROR' | 'INVALID_TRANSITION' | 'SLUG_CONFLICT',
    message: string,
    currentVersion?: number,
  ) {
    super(message);
    this.name = 'LocalGuideError';
    this.code = code;
    this.currentVersion = currentVersion;
  }
}
