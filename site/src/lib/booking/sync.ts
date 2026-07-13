import { getProperties, getProperty } from './config';
import { fetchAirbnbCalendar } from './ical';
import { recordSyncError, replaceImportedBlocks } from './repository';

export async function syncProperty(propertyId: string): Promise<{ propertyId: string; imported: number }> {
  const property = getProperty(propertyId);
  if (!property) throw new Error(`Unknown property: ${propertyId}`);
  const url = process.env[property.airbnbCalendarEnv];
  if (!url) throw new Error(`${property.airbnbCalendarEnv} is not configured.`);
  try {
    const blocks = await fetchAirbnbCalendar(url);
    await replaceImportedBlocks(property.id, blocks);
    return { propertyId, imported: blocks.length };
  } catch (error) {
    await recordSyncError(propertyId, error);
    throw error;
  }
}

export async function syncAllProperties() {
  const results = [];
  for (const property of getProperties()) results.push(await syncProperty(property.id));
  return results;
}
