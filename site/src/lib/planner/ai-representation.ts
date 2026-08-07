import { PLAN_ITEM_STATUSES, PLAN_ITEM_TYPES, type HolidayPlan } from './types.ts';

export const AI_PLAN_FORMAT = 'olrig-holiday-plan' as const;
export const AI_PLAN_VERSION = '1.0' as const;

export type AiPlanRepresentationV1 = {
  format: typeof AI_PLAN_FORMAT;
  version: typeof AI_PLAN_VERSION;
  planId: string;
  revision: number;
  trip: {
    title: string;
    arrival: string;
    departure: string;
    base: 'Olrig Bank, Kendal';
  };
  days: Array<{
    id: string;
    date: string | null;
    title: string;
    summary: string;
    items: Array<{
      id: string;
      type: (typeof PLAN_ITEM_TYPES)[number];
      startTime: string | null;
      endTime: string | null;
      title: string;
      status: (typeof PLAN_ITEM_STATUSES)[number];
      location: string | null;
      notes: string;
      localGuide: { slug: string; path: string } | null;
    }>;
  }>;
};

export function createAiPlanRepresentationV1(plan: HolidayPlan): AiPlanRepresentationV1 {
  if (plan.planType !== 'booking_linked' || !plan.startsOn || !plan.endsOn) {
    throw new Error('AI collaboration representations require a dated booking-linked plan.');
  }

  return {
    format: AI_PLAN_FORMAT,
    version: AI_PLAN_VERSION,
    planId: plan.id,
    revision: plan.revision,
    trip: {
      title: plan.title,
      arrival: plan.startsOn,
      departure: plan.endsOn,
      base: 'Olrig Bank, Kendal',
    },
    days: [...plan.days].sort((left, right) => left.position - right.position).map((day) => ({
      id: day.id,
      date: day.date,
      title: day.title,
      summary: day.summary,
      items: [...day.items]
        .filter((item) => item.visibility !== 'private')
        .sort((left, right) => left.position - right.position)
        .map((item) => ({
          id: item.id,
          type: item.itemType,
          startTime: item.startTime,
          endTime: item.endTime,
          title: item.title,
          status: item.status,
          location: item.locationText,
          notes: item.description,
          localGuide: item.localGuideSlug
            ? { slug: item.localGuideSlug, path: `/local-guide/${item.localGuideSlug}/` }
            : null,
        })),
    })),
  };
}
