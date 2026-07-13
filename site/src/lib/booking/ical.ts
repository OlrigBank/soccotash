import ical, { type VEvent } from 'node-ical';
import { formatDate } from './dates';

export type ImportedBlock = {
  externalUid: string;
  startsOn: string;
  endsOn: string;
  source: 'airbnb';
};

function isEvent(value: unknown): value is VEvent {
  return Boolean(value && typeof value === 'object' && 'type' in value && value.type === 'VEVENT' && 'start' in value && 'end' in value);
}

export async function fetchAirbnbCalendar(url: string): Promise<ImportedBlock[]> {
  const response = await fetch(url, { headers: { 'User-Agent': 'OlrigBank-Calendar-Sync/1.0' } });
  if (!response.ok) throw new Error(`Airbnb calendar returned HTTP ${response.status}.`);
  const parsed = await ical.async.parseICS(await response.text());
  const blocks: ImportedBlock[] = [];
  for (const event of Object.values(parsed)) {
    if (!isEvent(event) || !event.start || !event.end) continue;
    blocks.push({
      externalUid: event.uid || `${event.start.toISOString()}-${event.end.toISOString()}`,
      startsOn: formatDate(event.start),
      endsOn: formatDate(event.end),
      source: 'airbnb',
    });
  }
  return blocks;
}
