import { formatDate, isIsoDate, parseDate } from '../booking/dates.ts';
import type { PricingRule } from './types.ts';

const DAY_MS = 86_400_000;

export type PaymentTermsSnapshot = {
  pricingPlanId: string;
  pricingPlanVersion: number;
  depositPercentage: number;
  initialPaymentDeadlineDays: number;
  balanceDueDaysBeforeArrival: number;
  fullPaymentRequired: boolean;
  initialPaymentPence: number;
  balanceDuePence: number;
  initialPaymentDueAt: string;
  balanceDueOn: string;
};

type PaymentTermRuleType =
  | 'deposit_percentage'
  | 'initial_payment_deadline'
  | 'balance_payment_deadline';

function requiredRule(rules: PricingRule[], type: PaymentTermRuleType): PricingRule {
  const matching = rules.filter((rule) => rule.enabled && rule.type === type);
  if (matching.length !== 1) {
    throw new Error(`PAYMENT_TERM_RULE_${matching.length ? 'DUPLICATE' : 'MISSING'}:${type}`);
  }
  return matching[0];
}

function wholeDays(rule: PricingRule): number {
  const value = Number(rule.action.days);
  if (!Number.isInteger(value) || value < 0 || value > 3650) {
    throw new Error(`PAYMENT_TERM_DAYS_INVALID:${rule.type}`);
  }
  return value;
}

export function resolvePaymentTerms(input: {
  rules: PricingRule[];
  pricingPlanId: string;
  pricingPlanVersion: number;
  totalPence: number;
  acceptedAt: Date;
  arrival: string;
}): PaymentTermsSnapshot {
  if (!input.pricingPlanId || !Number.isInteger(input.pricingPlanVersion) || input.pricingPlanVersion < 1) {
    throw new Error('PAYMENT_TERM_PLAN_VERSION_INVALID');
  }
  if (!isIsoDate(input.arrival)) throw new Error('PAYMENT_TERM_ARRIVAL_INVALID');
  if (!Number.isInteger(input.totalPence) || input.totalPence < 0) {
    throw new Error('PAYMENT_TERM_TOTAL_INVALID');
  }
  if (Number.isNaN(input.acceptedAt.getTime())) throw new Error('PAYMENT_TERM_ACCEPTED_AT_INVALID');

  const depositRule = requiredRule(input.rules, 'deposit_percentage');
  const initialDeadlineRule = requiredRule(input.rules, 'initial_payment_deadline');
  const balanceDeadlineRule = requiredRule(input.rules, 'balance_payment_deadline');
  const depositPercentage = Number(depositRule.action.percentage);
  if (!Number.isFinite(depositPercentage) || depositPercentage <= 0 || depositPercentage > 100) {
    throw new Error('PAYMENT_TERM_DEPOSIT_PERCENTAGE_INVALID');
  }

  const initialPaymentDeadlineDays = wholeDays(initialDeadlineRule);
  const balanceDueDaysBeforeArrival = wholeDays(balanceDeadlineRule);
  const balanceDueDate = new Date(parseDate(input.arrival).getTime() - balanceDueDaysBeforeArrival * DAY_MS);
  const acceptanceDate = formatDate(input.acceptedAt);
  const balanceDueOn = formatDate(balanceDueDate);
  const fullPaymentRequired = acceptanceDate >= balanceDueOn;
  const initialPaymentPence = fullPaymentRequired
    ? input.totalPence
    : Math.round(input.totalPence * depositPercentage / 100);
  const initialPaymentDueAt = new Date(
    input.acceptedAt.getTime() + initialPaymentDeadlineDays * DAY_MS,
  ).toISOString();

  return {
    pricingPlanId: input.pricingPlanId,
    pricingPlanVersion: input.pricingPlanVersion,
    depositPercentage,
    initialPaymentDeadlineDays,
    balanceDueDaysBeforeArrival,
    fullPaymentRequired,
    initialPaymentPence,
    balanceDuePence: input.totalPence - initialPaymentPence,
    initialPaymentDueAt,
    balanceDueOn,
  };
}
