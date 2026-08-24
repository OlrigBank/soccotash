export const OCCUPANCY_SUBJECTS = [
  'guests',
  'adults',
  'children',
  'infants',
  'pets',
  'service_animals',
] as const;

export type OccupancySubject = typeof OCCUPANCY_SUBJECTS[number];
export type OccupancyPolicyStatus = 'draft' | 'published' | 'archived';
export type OccupancyOutcome = 'standard' | 'bespoke' | 'host_decision_required';
export type OccupancyExceedOutcome = Exclude<OccupancyOutcome, 'standard'>;

export type OccupancyRule = {
  id: string;
  policyId: string;
  subject: OccupancySubject;
  maximumStandardCount: number;
  exceedOutcome: OccupancyExceedOutcome;
};

export type OccupancyPolicy = {
  id: string;
  propertyId: string;
  name: string;
  status: OccupancyPolicyStatus;
  version: number;
  basedOnPolicyId: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  rules: OccupancyRule[];
};

export type OccupancyAssessmentInput = {
  adults: number;
  children: number;
  infants: number;
  pets: number;
  serviceAnimals: number;
};

export type OccupancyAssessmentReason = {
  code: string;
  subject: OccupancySubject | null;
  outcome: OccupancyExceedOutcome;
  message: string;
};

export type BookingOccupancyAssessment = {
  policyId: string | null;
  policyVersion: number | null;
  input: OccupancyAssessmentInput;
  result: OccupancyAssessment;
  standardThresholds: Partial<Record<OccupancySubject, number>>;
  assessedAt: string;
};

export type OccupancyAssessment = {
  outcome: OccupancyOutcome;
  reasons: OccupancyAssessmentReason[];
};
