import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { londonDate, plannerDayLabel, selectPlannerDay } from '../../src/lib/planner/day-selection.ts';
import type { PlanDay } from '../../src/lib/planner/types.ts';

const day = (id: string, date: string | null): PlanDay => ({ id, date, title: id, summary: '', position: 0, items: [] });
const days = [day('first', '2026-03-28'), day('today', '2026-03-29'), day('last', '2026-03-30')];

test('selection prefers a valid requested public id, then London today, then saved order', () => {
  const duringDstChange = new Date('2026-03-28T23:30:00Z');
  assert.equal(londonDate(duringDstChange), '2026-03-28');
  assert.equal(londonDate(new Date('2026-03-29T23:30:00Z')), '2026-03-30');
  assert.equal(selectPlannerDay(days, 'last', duringDstChange)?.id, 'last');
  assert.equal(selectPlannerDay(days, 'foreign', new Date('2026-03-29T12:00:00Z'))?.id, 'today');
  assert.equal(selectPlannerDay(days, null, new Date('2026-04-10T12:00:00Z'))?.id, 'first');
  assert.equal(selectPlannerDay([], null), null);
});

test('both private guest routes expose the accessible mobile day-view contract', async () => {
  const [booker, participant, styles] = await Promise.all([
    readFile(new URL('../../src/pages/booking/manage/[token]/planner/index.astro', import.meta.url), 'utf8'),
    readFile(new URL('../../src/pages/planner/invite/[token].astro', import.meta.url), 'utf8'),
    readFile(new URL('../../src/styles/global.css', import.meta.url), 'utf8'),
  ]);
  for (const page of [participant]) {
    assert.match(page, /Astro\.url\.searchParams\.get\('day'\)/);
    assert.match(page, /planner-day-selector[\s\S]*aria-current/);
    assert.match(page, /planner-item--compact/);
    assert.match(page, /planner-editor[\s\S]*<summary>Edit/);
  }
  assert.match(booker, /Astro\.url\.searchParams\.get\('day'\)/);
  assert.match(booker, /planner-day-selector[\s\S]*aria-current/);
  assert.match(booker, /scheduled-activity-list/);
  assert.match(booker, /data-open-item/);
  assert.match(styles, /\.planner-day-view \.planner-day\.is-selected \{ display:block; \}/);
  assert.match(styles, /min-height:44px/);
  assert.match(styles, /@media print[\s\S]*\.planner-day-view \.planner-day \{ display:block !important; \}/);
});

test('labels distinguish dated and undated plans', () => {
  assert.equal(plannerDayLabel(day('x', null), 1), 'Day 2');
  assert.match(plannerDayLabel(days[1], 1), /^Sun 29$/);
  assert.match(plannerDayLabel(days[1], 1, true), /^Sunday 29 March$/);
});
