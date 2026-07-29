import {
  BOOKING_ACTIONS,
  BOOKING_ACTORS,
  BOOKING_STATUSES,
  BOOKING_TRANSITION_RULES,
  type BookingStatus,
  type CalendarEffect,
} from './lifecycle.ts';

export function expectedCalendarEffect(from: BookingStatus, to: BookingStatus | null): CalendarEffect {
  const sourceBlocks = BOOKING_STATUSES[from].blocksDates;
  const targetBlocks = to === null ? false : BOOKING_STATUSES[to].blocksDates;
  if (!sourceBlocks && targetBlocks) return 'block';
  if (sourceBlocks && targetBlocks) return 'retain';
  if (sourceBlocks && !targetBlocks) return 'release';
  return 'none';
}

export function validateBookingLifecycleModel(): readonly string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const keys = new Set<string>();

  for (const transitionRule of BOOKING_TRANSITION_RULES) {
    if (ids.has(transitionRule.id)) errors.push(`Duplicate rule id: ${transitionRule.id}`);
    ids.add(transitionRule.id);

    const key = `${transitionRule.from}/${transitionRule.action}/${transitionRule.actor}`;
    if (keys.has(key)) errors.push(`Duplicate transition decision: ${key}`);
    keys.add(key);

    if (!(transitionRule.from in BOOKING_STATUSES)) errors.push(`Unknown source status in ${transitionRule.id}: ${transitionRule.from}`);
    if (transitionRule.to !== null && !(transitionRule.to in BOOKING_STATUSES)) errors.push(`Unknown target status in ${transitionRule.id}: ${transitionRule.to}`);
    if (!(transitionRule.action in BOOKING_ACTIONS)) errors.push(`Unknown action in ${transitionRule.id}: ${transitionRule.action}`);
    if (!BOOKING_ACTORS.includes(transitionRule.actor)) errors.push(`Unknown actor in ${transitionRule.id}: ${transitionRule.actor}`);

    const expectedEffect = expectedCalendarEffect(transitionRule.from, transitionRule.to);
    if (transitionRule.calendarEffect !== expectedEffect) {
      errors.push(`Calendar effect for ${transitionRule.id} is ${transitionRule.calendarEffect}; expected ${expectedEffect}`);
    }

    if (transitionRule.action === 'delete_request' && transitionRule.to !== null) errors.push(`Delete rule ${transitionRule.id} must have a null target.`);
    if (transitionRule.action !== 'delete_request' && transitionRule.to === null) errors.push(`Only delete_request may have a null target: ${transitionRule.id}`);
    if (BOOKING_STATUSES[transitionRule.from].terminal) errors.push(`Terminal status ${transitionRule.from} must not have outgoing rules (${transitionRule.id}).`);
  }

  for (const [status, metadata] of Object.entries(BOOKING_STATUSES) as [BookingStatus, (typeof BOOKING_STATUSES)[BookingStatus]][]) {
    if (metadata.terminal && BOOKING_TRANSITION_RULES.some((transitionRule) => transitionRule.from === status)) {
      errors.push(`Terminal status ${status} has outgoing transitions.`);
    }
  }

  return Object.freeze(errors);
}
