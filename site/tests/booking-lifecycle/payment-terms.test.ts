import assert from 'node:assert/strict';
import test from 'node:test';
import { resolvePaymentTerms } from '../../src/lib/pricing/payment-terms.ts';
import type { PricingRule, PricingRuleType } from '../../src/lib/pricing/types.ts';

function rule(type: PricingRuleType, action: PricingRule['action']): PricingRule {
  return {
    id: type,
    planId: '1',
    ruleDefinitionId: null,
    type,
    name: type,
    position: 1,
    priority: 100,
    enabled: true,
    stackable: false,
    stackingGroup: 'payment-terms',
    conditions: {},
    action,
  };
}

const paymentRules = [
  rule('deposit_percentage', { percentage: 25 }),
  rule('initial_payment_deadline', { days: 7 }),
  rule('balance_payment_deadline', { days: 42 }),
];

test('uses a 25% deposit when acceptance is more than 42 days before arrival', () => {
  const result = resolvePaymentTerms({
    rules: paymentRules,
    pricingPlanId: '17',
    pricingPlanVersion: 3,
    totalPence: 200_000,
    acceptedAt: new Date('2026-08-01T12:00:00.000Z'),
    arrival: '2026-10-01',
  });

  assert.equal(result.fullPaymentRequired, false);
  assert.equal(result.pricingPlanId, '17');
  assert.equal(result.pricingPlanVersion, 3);
  assert.equal(result.initialPaymentPence, 50_000);
  assert.equal(result.balanceDuePence, 150_000);
  assert.equal(result.initialPaymentDueAt, '2026-08-08T12:00:00.000Z');
  assert.equal(result.balanceDueOn, '2026-08-20');
});

test('requires full payment when acceptance is exactly 42 days before arrival', () => {
  const result = resolvePaymentTerms({
    rules: paymentRules,
    pricingPlanId: '17',
    pricingPlanVersion: 3,
    totalPence: 200_000,
    acceptedAt: new Date('2026-08-20T09:30:00.000Z'),
    arrival: '2026-10-01',
  });

  assert.equal(result.fullPaymentRequired, true);
  assert.equal(result.initialPaymentPence, 200_000);
  assert.equal(result.balanceDuePence, 0);
  assert.equal(result.balanceDueOn, '2026-08-20');
});

test('fails closed when a required pricing-plan payment rule is missing', () => {
  assert.throws(
    () => resolvePaymentTerms({
      rules: paymentRules.slice(0, 2),
      pricingPlanId: '17',
      pricingPlanVersion: 3,
      totalPence: 200_000,
      acceptedAt: new Date('2026-08-01T12:00:00.000Z'),
      arrival: '2026-10-01',
    }),
    /PAYMENT_TERM_RULE_MISSING:balance_payment_deadline/,
  );
});
