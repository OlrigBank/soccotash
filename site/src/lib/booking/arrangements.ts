export const OLRIG_BANK_PROPERTY_ID = 'olrig-bank' as const;

export const RESOURCES = Object.freeze([
  { id: 'main-house', name: 'Main House', type: 'accommodation' },
  { id: 'cottage', name: 'Cottage', type: 'accommodation' },
  { id: 'grounds', name: 'Grounds', type: 'outdoor' },
] as const);

export type ResourceId = (typeof RESOURCES)[number]['id'];

export const ARRANGEMENTS = Object.freeze([
  { id: 'main-house-stay', legacyId: 'main-house', name: 'Main House stay', resources: ['main-house'] },
  { id: 'cottage-stay', legacyId: 'cottage', name: 'Cottage stay', resources: ['cottage'] },
  { id: 'olrig-bank-stay', legacyId: 'whole-property', name: 'Olrig Bank stay', resources: ['main-house', 'cottage', 'grounds'] },
] as const);

export type ArrangementId = (typeof ARRANGEMENTS)[number]['id'];

export function arrangementFromLegacyId(legacyId: string) {
  return ARRANGEMENTS.find((arrangement) => arrangement.legacyId === legacyId);
}

export function isResourceId(value: string): value is ResourceId {
  return RESOURCES.some((resource) => resource.id === value);
}

export function resourceName(id: string): string {
  return RESOURCES.find((resource) => resource.id === id)?.name ?? id;
}

