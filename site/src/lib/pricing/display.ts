import type { PricingLine, PricingRuleType, PricingSimulationResult } from './types';

export type CustomerPricingLine = {
  label: string;
  detail: string;
  category: Exclude<PricingLine['category'], 'commission' | 'restriction'>;
  amountPence: number;
};

const COMPOUNDED_ACCOMMODATION_TYPES = new Set<PricingRuleType>([
  'default_nightly_price',
  'weekend_adjustment',
  'seasonal_adjustment',
  'date_override',
  'fixed_package',
  'price_floor',
]);

function formatCurrency(pence: number, currency: string): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(pence / 100);
}

function inferredRuleType(line: PricingLine): PricingRuleType | null {
  if (line.ruleType) return line.ruleType;

  // Compatibility for provisional requests recorded before ruleType was included
  // in the stored pricing result.
  const detail = line.detail.toLowerCase();
  if (detail.includes('default nightly amount')) return 'default_nightly_price';
  if (detail.includes('selected night')) return 'weekend_adjustment';
  if (detail.includes('seasonal night')) return 'seasonal_adjustment';
  if (detail.includes('replaced with the fixed nightly amount')) return 'date_override';
  if (detail.includes('fixed') && detail.includes('night package total')) return 'fixed_package';
  if (detail.includes('price floor')) return 'price_floor';
  return null;
}

export function customerPricingLines(
  result: Pick<PricingSimulationResult, 'currency' | 'nights' | 'lines'>,
): CustomerPricingLine[] {
  const visibleLines = result.lines.filter(
    (line): line is PricingLine & { category: CustomerPricingLine['category'] } =>
      line.category !== 'commission' && line.category !== 'restriction',
  );
  const compoundedLines = visibleLines.filter((line) => {
    const type = inferredRuleType(line);
    return type !== null && COMPOUNDED_ACCOMMODATION_TYPES.has(type);
  });

  if (!compoundedLines.length || result.nights < 1) {
    return visibleLines.map(({ label, detail, category, amountPence }) => ({
      label,
      detail,
      category,
      amountPence,
    }));
  }

  const compoundedRuleIds = new Set(compoundedLines.map((line) => line.ruleId));
  const accommodationPence = compoundedLines.reduce((total, line) => total + line.amountPence, 0);
  const averageNightlyPence = Math.round(accommodationPence / result.nights);
  const nightLabel = result.nights === 1 ? 'night' : 'nights';

  return [
    {
      label: `${result.nights} ${nightLabel} × ${formatCurrency(averageNightlyPence, result.currency)}`,
      detail: 'Accommodation',
      category: 'accommodation',
      amountPence: accommodationPence,
    },
    ...visibleLines
      .filter((line) => !compoundedRuleIds.has(line.ruleId))
      .map(({ label, detail, category, amountPence }) => ({ label, detail, category, amountPence })),
  ];
}

export function customerPricingLinesFromUnknown(value: unknown): CustomerPricingLine[] {
  if (!value || typeof value !== 'object') return [];
  const result = value as Record<string, unknown>;
  if (!Array.isArray(result.lines)) return [];

  const lines = result.lines.flatMap((item): PricingLine[] => {
    if (!item || typeof item !== 'object') return [];
    const line = item as Record<string, unknown>;
    const category = line.category;
    if (
      typeof line.ruleId !== 'string' ||
      typeof line.label !== 'string' ||
      typeof line.detail !== 'string' ||
      typeof line.amountPence !== 'number' ||
      (category !== 'accommodation' && category !== 'discount' && category !== 'fee' && category !== 'commission' && category !== 'restriction')
    ) return [];

    return [{
      ruleId: line.ruleId,
      ruleType: typeof line.ruleType === 'string' ? line.ruleType as PricingRuleType : undefined,
      label: line.label,
      detail: line.detail,
      amountPence: line.amountPence,
      category,
    }];
  });

  return customerPricingLines({
    currency: typeof result.currency === 'string' ? result.currency : 'GBP',
    nights: typeof result.nights === 'number' ? result.nights : 0,
    lines,
  });
}
