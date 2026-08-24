import { OCCUPANCY_SUBJECTS, type OccupancyAssessment, type OccupancyAssessmentInput, type OccupancyOutcome, type OccupancyPolicy, type OccupancySubject } from './types.ts';

const LABELS: Record<OccupancySubject, string> = {
  guests: 'guest', adults: 'adult', children: 'child', infants: 'infant', pets: 'pet', service_animals: 'service animal',
};

const OUTCOME_RANK: Record<OccupancyOutcome, number> = {
  standard: 0, bespoke: 1, host_decision_required: 2,
};

function validCount(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

export function validateAssessmentInput(input: OccupancyAssessmentInput): OccupancyAssessmentInput {
  if (![input.adults, input.children, input.infants, input.pets, input.serviceAnimals].every(validCount)) {
    throw new Error('INVALID_OCCUPANCY_INPUT');
  }
  if (input.adults < 1) throw new Error('INVALID_OCCUPANCY_INPUT');
  if (input.serviceAnimals > input.pets) throw new Error('INVALID_SERVICE_ANIMAL_COUNT');
  return input;
}

function subjectCount(subject: OccupancySubject, input: OccupancyAssessmentInput): number {
  if (subject === 'guests') return input.adults + input.children;
  if (subject === 'service_animals') return input.serviceAnimals;
  return input[subject];
}

export function assessOccupancy(policy: OccupancyPolicy, rawInput: OccupancyAssessmentInput): OccupancyAssessment {
  const input = validateAssessmentInput(rawInput);
  const reasons: OccupancyAssessment['reasons'] = [];
  for (const subject of OCCUPANCY_SUBJECTS) {
    const value = subjectCount(subject, input);
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
