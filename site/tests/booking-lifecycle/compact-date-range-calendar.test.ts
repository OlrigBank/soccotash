import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const componentUrl = new URL('../../src/components/CompactBookingPanel.astro', import.meta.url);

test('compact panels select arrival and departure on one calendar', async () => {
  const component = await readFile(componentUrl, 'utf8');

  assert.match(component, /data-compact-date-calendar/);
  assert.match(component, /Choose arrival and departure/);
  assert.match(component, /button\.addEventListener\('click', \(\) => selectDate\(value\)\)/);
  assert.match(component, /arrival\.value = value[\s\S]*departure\.value = ''/);
  assert.match(component, /departure\.value = value/);
  assert.match(component, /is-arrival/);
  assert.match(component, /is-departure/);
  assert.match(component, /is-in-range/);
  assert.match(component, /button\.setAttribute\('aria-pressed', String\(selectedArrival \|\| selectedDeparture\)\)/);
  assert.match(component, /:global\(button\.is-in-range\)[\s\S]*background: #eef4eb/);
  assert.match(component, /:global\(button:is\(\.is-arrival, \.is-departure\)\)[\s\S]*background: var\(--soft-accent\)/);
  assert.match(component, /input\.addEventListener\('click', openCalendar\)/);
  assert.match(component, /setCalendarOpen\(false\)[\s\S]*departure\.focus/);
  assert.match(component, /aria-controls=\{`\$\{idPrefix\}-calendar`\}/);
  assert.match(component, /aria-expanded="false"/);
  assert.match(component, /compact-booking-panel--calendar-ready:not\(\.compact-booking-panel--calendar-open\)/);
  assert.match(component, /'Quick Check'/);
});

test('the range calendar preserves labelled native-date fallback and minimum stays', async () => {
  const component = await readFile(componentUrl, 'utf8');

  assert.match(component, /name="arrival" type="date" required/);
  assert.match(component, /name="departure" type="date" required/);
  assert.match(component, /panel\.classList\.add\('compact-booking-panel--calendar-ready'\)/);
  assert.match(component, /data-minimum-nights=\{property\.minimumNights\}/);
  assert.match(component, /value < earliestDeparture/);
  assert.match(component, /This stay needs at least/);
});
