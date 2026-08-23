import { productionAssetUrl, productionUrl } from './public-metadata.ts';

type ListingStructuredDataInput = {
  site: URL;
  slug: string;
  identifier: string;
  name: string;
  description: string;
  sleeps?: string;
  bedrooms?: string;
  bathrooms?: string;
  imagePaths: string[];
  hasGarden: boolean;
};

function leadingInteger(value: string | undefined): number | undefined {
  const match = value?.match(/\d+/);
  return match ? Number(match[0]) : undefined;
}

export function vacationRentalStructuredData(input: ListingStructuredDataInput) {
  const canonical = productionUrl(input.site, `/listings/${input.slug}/`).href;
  const occupancy = leadingInteger(input.sleeps);
  const bedroomCount = leadingInteger(input.bedrooms);
  const bathroomCount = leadingInteger(input.bathrooms);
  const images = [...new Set(input.imagePaths.filter(Boolean).map((path) => productionAssetUrl(input.site, path).href))];
  const adultOccupancy = input.sleeps?.toLowerCase().includes('adult') ?? false;

  return {
    '@context': 'https://schema.org',
    '@type': 'VacationRental',
    '@id': `${canonical}#vacation-rental`,
    identifier: input.identifier,
    name: input.name,
    description: input.description,
    url: canonical,
    image: images,
    brand: { '@type': 'Brand', name: 'Olrig Bank' },
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Kendal',
      addressRegion: 'Cumbria',
      addressCountry: 'GB',
    },
    containsPlace: {
      '@type': 'Accommodation',
      additionalType: 'EntirePlace',
      ...(occupancy !== undefined && {
        occupancy: {
          '@type': 'QuantitativeValue',
          value: occupancy,
          ...(adultOccupancy && { unitText: 'adults' }),
        },
      }),
      ...(bedroomCount !== undefined && { numberOfBedrooms: bedroomCount }),
      ...(bathroomCount !== undefined && { numberOfBathroomsTotal: bathroomCount }),
      ...(input.hasGarden && {
        amenityFeature: [{ '@type': 'LocationFeatureSpecification', name: 'Garden', value: true }],
      }),
    },
  };
}

export function serializeStructuredData(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
