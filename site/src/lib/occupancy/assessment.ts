import { getPublishedOccupancyPolicy } from './repository.ts';
import { assessOccupancy, validateAssessmentInput } from './evaluator.ts';
import type { BookingOccupancyAssessment, OccupancyAssessmentInput } from './types.ts';

export async function assessPublishedOccupancy(
  propertyId: string,
  rawInput: OccupancyAssessmentInput,
  database?: { query: (text: string, values?: unknown[]) => Promise<any> },
): Promise<BookingOccupancyAssessment> {
  const input = validateAssessmentInput(rawInput);
  const policy = await getPublishedOccupancyPolicy(propertyId, database);
  return {
    policyId: policy?.id ?? null,
    policyVersion: policy?.version ?? null,
    input,
    result: policy ? assessOccupancy(policy, input) : {
      outcome: 'host_decision_required',
      reasons: [{
        code: 'published_policy_not_available',
        subject: null,
        outcome: 'host_decision_required',
        message: 'Olrig Bank needs to review this party before confirming the arrangement.',
      }],
    },
    standardThresholds: Object.fromEntries(policy?.rules.map((rule) => [rule.subject, rule.maximumStandardCount]) ?? []),
    assessedAt: new Date().toISOString(),
  };
}
