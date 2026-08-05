export const PLAN_TYPES = ['example', 'booking_linked'] as const;
export const PLAN_PUBLICATION_STATUSES = ['draft', 'published', 'unpublished'] as const;
export const PLAN_VISIBILITIES = ['private', 'restricted', 'public'] as const;
export const PLAN_ITEM_TYPES = ['activity', 'journey', 'meal', 'reservation', 'free_time', 'other'] as const;
export const PLAN_ITEM_STATUSES = ['idea', 'proposed', 'agreed', 'booked', 'completed', 'cancelled'] as const;
export const PLAN_ITEM_VISIBILITIES = ['participants', 'private', 'public'] as const;

export type PlanType = (typeof PLAN_TYPES)[number];
export type PlanPublicationStatus = (typeof PLAN_PUBLICATION_STATUSES)[number];
export type PlanVisibility = (typeof PLAN_VISIBILITIES)[number];
export type PlanItemType = (typeof PLAN_ITEM_TYPES)[number];
export type PlanItemStatus = (typeof PLAN_ITEM_STATUSES)[number];
export type PlanItemVisibility = (typeof PLAN_ITEM_VISIBILITIES)[number];

export type PlanActor = {
  type: 'administrator';
  adminUserId: string;
};

export type PlanRevision = {
  revision: number;
  actorType: 'administrator' | 'guest' | 'external_ai' | 'system';
  adminUserId: string | null;
  source: 'admin' | 'guest' | 'external_ai_proposal' | 'system';
  action: string;
  summary: string;
  changes: Record<string, unknown>;
  createdAt: string;
};

export type PlanItem = {
  id: string;
  title: string;
  description: string;
  itemType: PlanItemType;
  startTime: string | null;
  endTime: string | null;
  locationText: string | null;
  localGuideSlug: string | null;
  status: PlanItemStatus;
  position: number;
  reservationNote: string | null;
  visibility: PlanItemVisibility;
};

export type PlanDay = {
  id: string;
  date: string | null;
  title: string;
  summary: string;
  position: number;
  items: PlanItem[];
};

export type HolidayPlan = {
  id: string;
  planType: PlanType;
  bookingId: string | null;
  title: string;
  description: string;
  publicationStatus: PlanPublicationStatus;
  visibility: PlanVisibility;
  startsOn: string | null;
  endsOn: string | null;
  durationDays: number | null;
  revision: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  days: PlanDay[];
  revisions: PlanRevision[];
};

export class PlannerError extends Error {
  readonly code: 'NOT_FOUND' | 'STALE_REVISION' | 'VALIDATION_ERROR';

  constructor(code: 'NOT_FOUND' | 'STALE_REVISION' | 'VALIDATION_ERROR', message: string) {
    super(message);
    this.name = 'PlannerError';
    this.code = code;
  }
}

export function requireText(value: string, field: string, max: number, min = 1): string {
  const clean = value.trim();
  if (clean.length < min || clean.length > max) {
    throw new PlannerError('VALIDATION_ERROR', `${field} must contain between ${min} and ${max} characters.`);
  }
  return clean;
}

export function optionalText(value: string | null | undefined, field: string, max: number): string | null {
  if (value == null || value.trim() === '') return null;
  return requireText(value, field, max);
}

export function validateGuideSlug(value: string | null | undefined): string | null {
  const slug = optionalText(value, 'Local Guide slug', 200);
  if (slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new PlannerError('VALIDATION_ERROR', 'Local Guide slug is invalid.');
  }
  return slug;
}
