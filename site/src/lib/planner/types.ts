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

export type BookerPlanActor = {
  type: 'booker';
  bookingId: string;
};

export type ParticipantRole = 'owner' | 'editor' | 'contributor' | 'viewer';

export type ParticipantPlanActor = {
  type: 'participant';
  participantId: string;
  planId: string;
  role: Exclude<ParticipantRole, 'owner'>;
};

export type PlannerRevisionActor = PlanActor | BookerPlanActor | ParticipantPlanActor;

export type PlanRevision = {
  revision: number;
  actorType: 'administrator' | 'guest' | 'external_ai' | 'system';
  adminUserId: string | null;
  participantId: string | null;
  actorDisplayName: string;
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
  sourceUrl: string | null;
  localGuideEntryId: string | null;
  localGuideSlug: string | null;
  status: PlanItemStatus;
  position: number;
  reservationNote: string | null;
  visibility: PlanItemVisibility;
};

export type PlanCandidateActivity = {
  id: string;
  title: string;
  description: string;
  sourceUrl: string | null;
  localGuideEntryId: string | null;
  localGuideSlug: string | null;
  position: number;
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
  publicSlug: string | null;
  startsOn: string | null;
  endsOn: string | null;
  durationDays: number | null;
  revision: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  days: PlanDay[];
  candidates: PlanCandidateActivity[];
  revisions: PlanRevision[];
};

export type HolidayPlanSummary = Omit<HolidayPlan, 'days' | 'revisions'> & {
  dayCount: number;
};

export type GuideContributionCandidate = {
  id: string;
  itemId: string | null;
  submittedByParticipantId: string;
  submittedByName: string;
  offeredTitle: string;
  offeredDescription: string;
  offeredLocationText: string | null;
  attributionPermitted: boolean;
  attributionName: string | null;
  status: 'pending' | 'withdrawn' | 'under_review' | 'accepted' | 'rejected';
  consentedAt: string;
  withdrawnAt: string | null;
};

export type GuideContributionModerationCandidate = GuideContributionCandidate & {
  consentVersion: string;
  consentStatement: string;
  reviewedTitle: string | null;
  reviewedDescription: string | null;
  reviewedLocationText: string | null;
  resultType: 'new_entry_draft' | 'suggested_update' | null;
  resultGuideSlug: string | null;
  reviewedCategoryId: string | null;
  resultLocalGuideEntryId: string | null;
  resultLocalGuideRevisionId: string | null;
  moderationNotes: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
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

export function validatePublicId(value: string, field = 'Identifier'): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new PlannerError('VALIDATION_ERROR', `${field} is invalid.`);
  }
  return value;
}

export function validateDate(value: string | null | undefined, field: string): string | null {
  if (value == null || value === '') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new PlannerError('VALIDATION_ERROR', `${field} must use YYYY-MM-DD format.`);
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new PlannerError('VALIDATION_ERROR', `${field} is not a real calendar date.`);
  }
  return value;
}

export function validateTime(value: string | null | undefined, field: string): string | null {
  if (value == null || value === '') return null;
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new PlannerError('VALIDATION_ERROR', `${field} must use 24-hour HH:MM format.`);
  }
  return value;
}

const ITEM_STATUS_TRANSITIONS: Record<PlanItemStatus, readonly PlanItemStatus[]> = {
  idea: ['proposed', 'cancelled'], proposed: ['idea', 'agreed', 'cancelled'],
  agreed: ['proposed', 'booked', 'cancelled'], booked: ['completed', 'cancelled'],
  completed: [], cancelled: ['idea', 'proposed'],
};

export function validateItemStatusTransition(from: PlanItemStatus, to: PlanItemStatus): void {
  if (from !== to && !ITEM_STATUS_TRANSITIONS[from].includes(to)) {
    throw new PlannerError('VALIDATION_ERROR', `Plan item cannot move from ${from} to ${to}.`);
  }
}
