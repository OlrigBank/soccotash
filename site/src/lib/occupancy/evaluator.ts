import { OCCUPANCY_SUBJECTS, type OccupancyAssessment, type OccupancyAssessmentInput, type OccupancyOutcome, type OccupancyPolicy, type OccupancySubject } from './types.ts';

const LABELS: Record<OccupancySubject, string> = {
  adults: 'adult', children: 'child', infants: 'infant', pets: 'pet', service_animals: 'service animal',
};

const OUTCOME_RANK: Record<OccupancyOutcome, number> = {
  standard: 0, bespoke: 1, host_decision_required: 2,
};

function validCount(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

export function validateAssessmentInput(input: OccupancyAssessmentInput): OccupancyAssessmentInput {
  if (!OCCUPANCY_SUBJECTS.every((subject) => validCount(input[subject === 'service_animals' ? 'serviceAnimals' : subject]))) {
    throw new Error('INVALID_OCCUPANCY_INPUT');
  }
  if (input.adults < 1) throw new Error('INVALID_OCCUPANCY_INPUT');
  if (input.serviceAnimals > input.pets) throw new Error('INVALID_SERVICE_ANIMAL_COUNT');
  return input;
}

export function assessOccupancy(policy: OccupancyPolicy, rawInput: OccupancyAssessmentInput): OccupancyAssessment {
  const input = validateAssessmentInput(rawInput);
  const reasons: OccupancyAssessment['reasons'] = [];
  for (const subject of OCCUPANCY_SUBJECTS) {
    const value = subject === 'service_animals' ? input.serviceAnimals : input[subject];
    const rule = policy.rules.find((candidate) => candidate.subject === subject);
    if (!rule) {
      if (value > 0) reasons.push({
        code: `${subject}_policy_not_defined`, subject, outcome: 'host_decision_required',
        message: `Olrig Bank needs to review the ${LABELS[subject]} arrangement.`,
      });
      continue;
    }
    if (value > rule.maximumStandardCount) reasons.push({
      code: `${subject}_standard_threshold_exceeded`, subject, outcome: rule.exceedOutcome,
      message: rule.exceedOutcome === 'bespoke'
        ? `The number of ${LABELS[subject]}${value === 1 ? '' : 's'} requires a bespoke arrangement.`
        : `Olrig Bank needs to review the number of ${LABELS[subject]}${value === 1 ? '' : 's'}.`,
    });
  }
  const outcome = reasons.reduce<OccupancyOutcome>(
    (current, reason) => OUTCOME_RANK[reason.outcome] > OUTCOME_RANK[current] ? reason.outcome : current,
    'standard',
  );
  return { outcome, reasons };
}
