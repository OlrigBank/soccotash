import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

export type PropertyConfig = {
  id: string;
  name: string;
  listingSlug: string;
  airbnbCalendarEnv: string;
  minimumNights: number;
  maximumGuests: number;
  enabled: boolean;
};

let cache: PropertyConfig[] | undefined;

export function getProperties(): PropertyConfig[] {
  if (cache) return cache;
  const candidates = [
    path.join(process.cwd(), 'src/data/booking/properties.yml'),
    path.join(process.cwd(), 'site/src/data/booking/properties.yml'),
  ];
  const filename = candidates.find((candidate) => fs.existsSync(candidate));
  if (!filename) throw new Error('Booking property configuration was not found.');
  const parsed = YAML.parse(fs.readFileSync(filename, 'utf8')) as { properties?: PropertyConfig[] };
  cache = (parsed.properties ?? []).filter((property) => property.enabled);
  return cache;
}

export function getProperty(id: string): PropertyConfig | undefined {
  return getProperties().find((property) => property.id === id);
}
