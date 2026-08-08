import type { PlanDay } from './types.ts';

export const PLANNER_TIME_ZONE = 'Europe/London';

export function londonDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: PLANNER_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

export function selectPlannerDay(days: PlanDay[], requestedId: string | null, now = new Date()): PlanDay | null {
  if (days.length === 0) return null;
  const requested = requestedId ? days.find((day) => day.id === requestedId) : null;
  if (requested) return requested;
  const today = londonDate(now);
  return days.find((day) => day.date === today) ?? days[0];
}

export function plannerDayLabel(day: PlanDay, index: number, long = false): string {
  if (!day.date) return `Day ${index + 1}`;
  const date = new Date(`${day.date}T12:00:00Z`);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: PLANNER_TIME_ZONE,
    weekday: long ? 'long' : 'short',
    day: 'numeric',
    month: long ? 'long' : undefined,
  }).format(date);
}
