import { getAvailabilityProperty, getProperties, getProperty } from './config';
import { fetchAirbnbCalendars, parseCalendarUrls } from './ical';
import { recordSyncAttempt, recordSyncError, replaceImportedBlocks } from './repository';

function propertyCalendarUrls(environmentName: string): string[] {
  const configured = process.env[environmentName];
  const legacyName = environmentName.endsWith('_URLS') ? environmentName.slice(0, -1) : undefined;
  return parseCalendarUrls(configured || (legacyName ? process.env[legacyName] : undefined));
}

export async function syncProperty(propertyId: string): Promise<{ propertyId: string; feeds: number; imported: number }> {
  const property = getProperty(propertyId);
  if (!property) throw new Error(`Unknown property: ${propertyId}`);
  const availabilityProperty = getAvailabilityProperty(property);
  if (!availabilityProperty) throw new Error(`Availability source was not found for property: ${propertyId}`);
  if (availabilityProperty.id !== property.id) {
    const result = await syncProperty(availabilityProperty.id);
    return { ...result, propertyId };
  }
  if (!property.airbnbCalendarEnv) throw new Error(`No Airbnb calendar is configured for ${property.id}.`);

  const urls = propertyCalendarUrls(property.airbnbCalendarEnv);
  if (!urls.length) throw new Error(`${property.airbnbCalendarEnv} is not configured.`);

  await recordSyncAttempt(property.id);
  try {
    const blocks = await fetchAirbnbCalendars(urls);
    await replaceImportedBlocks(property.id, blocks, urls.length);
    return { propertyId, feeds: urls.length, imported: blocks.length };
  } catch (error) {
    await recordSyncError(property.id, error);
    throw error;
  }
}

export async function syncAllProperties(): Promise<Array<{
  propertyId: string;
  ok: boolean;
  feeds?: number;
  imported?: number;
  error?: string;
}>> {
  const results = [];
  for (const property of getProperties().filter((candidate) => candidate.airbnbCalendarEnv)) {
    try {
      const result = await syncProperty(property.id);
      results.push({ ...result, ok: true });
    } catch (error) {
      results.push({
        propertyId: property.id,
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown calendar sync error.',
      });
    }
  }
  return results;
}
