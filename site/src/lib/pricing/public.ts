import { getPublishedPricingPlan } from './repository';
import { simulatePricing } from './engine';
import type { PricingSimulationInput, PublishedPricingQuote } from './types';

export async function getPublishedPricingQuote(
  input: PricingSimulationInput,
): Promise<PublishedPricingQuote | null> {
  const plan = await getPublishedPricingPlan(input.propertyId);
  if (!plan) return null;
  return {
    plan: {
      id: plan.id,
      name: plan.name,
      version: plan.version,
      publishedAt: plan.publishedAt,
    },
    input,
    result: simulatePricing(plan, input),
  };
}

export function publicQuotePayload(quote: PublishedPricingQuote) {
  const { result } = quote;
  return {
    plan: quote.plan,
    pricingAvailable: true,
    eligible: result.eligible,
    currency: result.currency,
    nights: result.nights,
    accommodationPence: result.accommodationPence,
    feesPence: result.feesPence,
    guestTotalPence: result.guestTotalPence,
    averageNightlyPence: result.averageNightlyPence,
    lines: result.lines
      .filter((item) => item.category !== 'commission')
      .map((item) => ({
        label: item.label,
        category: item.category,
        amountPence: item.amountPence,
        detail: item.detail,
      })),
    restrictions: result.lines
      .filter((item) => item.category === 'restriction')
      .map((item) => item.detail),
    warnings: result.warnings.filter((warning) => !warning.toLowerCase().includes('conflict')),
  };
}
