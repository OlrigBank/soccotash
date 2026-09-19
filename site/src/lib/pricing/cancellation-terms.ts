import { formatDate, isIsoDate, parseDate } from '../booking/dates.ts';

export type CancellationRefundBand = {
  minimumDaysBeforeArrival: number | null;
  maximumDaysBeforeArrival: number | null;
  refundPercentage: number;
};

export type CancellationTermsSnapshot = {
  policyVersion: 'e17-v1';
  maximumGuests: 8;
  calculationBasis: 'verified_payments';
  refundBands: CancellationRefundBand[];
  securityDeposit: {
    amountPence: number;
    holdDaysBeforeArrival: number;
    releaseDaysAfterDeparture: number;
  } | null;
  processingFeeExcluded: false;
};

export type CancellationRefundEstimate = {
  cancelledOn: string;
  daysBeforeArrival: number;
  refundPercentage: number;
  paymentsMadePence: number;
  refundAmountPence: number;
  retainedAmountPence: number;
  policyVersion: string;
};

export const DEFAULT_CANCELLATION_TERMS: CancellationTermsSnapshot = {
  policyVersion: 'e17-v1',
  maximumGuests: 8,
  calculationBasis: 'verified_payments',
  refundBands: [
    { minimumDaysBeforeArrival: 30, maximumDaysBeforeArrival: null, refundPercentage: 100 },
    { minimumDaysBeforeArrival: 14, maximumDaysBeforeArrival: 29, refundPercentage: 50 },
    { minimumDaysBeforeArrival: null, maximumDaysBeforeArrival: 13, refundPercentage: 0 },
  ],
  securityDeposit: null,
  processingFeeExcluded: false,
};

export function cancellationTermsSnapshot(value: unknown): CancellationTermsSnapshot {
  if (!value || typeof value !== 'object') return DEFAULT_CANCELLATION_TERMS;
  const candidate = value as Partial<CancellationTermsSnapshot>;
  if (candidate.policyVersion !== 'e17-v1' || !Array.isArray(candidate.refundBands)) {
    return DEFAULT_CANCELLATION_TERMS;
  }
  return {
    ...DEFAULT_CANCELLATION_TERMS,
    ...candidate,
    refundBands: candidate.refundBands as CancellationRefundBand[],
  };
}

export function formatCancellationTerms(snapshot: CancellationTermsSnapshot = DEFAULT_CANCELLATION_TERMS): string {
  return [
    `Cancellations 30 days or more before arrival receive ${snapshot.refundBands[0].refundPercentage}% of verified payments made.`,
    `Cancellations 14 to 29 days before arrival receive ${snapshot.refundBands[1].refundPercentage}% of verified payments made.`,
    `Cancellations fewer than 14 days before arrival receive ${snapshot.refundBands[2].refundPercentage}% of verified payments made.`,
    'Refunds are calculated on verified payments recorded for this booking.',
    snapshot.securityDeposit
      ? `A security deposit of £${(snapshot.securityDeposit.amountPence / 100).toFixed(2)} is authorised ${snapshot.securityDeposit.holdDaysBeforeArrival} day(s) before arrival and released ${snapshot.securityDeposit.releaseDaysAfterDeparture} day(s) after departure.`
      : 'No security deposit is currently charged.',
  ].join(' ');
}

function daysBeforeArrival(arrival: string, cancelledOn: string): number {
  return Math.max(0, Math.floor((parseDate(arrival).getTime() - parseDate(cancelledOn).getTime()) / 86_400_000));
}

function refundPercentageForDays(snapshot: CancellationTermsSnapshot, days: number): number {
  return snapshot.refundBands.find((band) =>
    (band.minimumDaysBeforeArrival === null || days >= band.minimumDaysBeforeArrival)
      && (band.maximumDaysBeforeArrival === null || days <= band.maximumDaysBeforeArrival),
  )?.refundPercentage ?? 0;
}

export function calculateCancellationRefund(input: {
  arrival: string;
  cancelledOn?: string;
  payments: Array<{ amountPence: number; status: string }>;
  snapshot?: CancellationTermsSnapshot | null;
}): CancellationRefundEstimate {
  const cancelledOn = input.cancelledOn || formatDate(new Date());
  if (!isIsoDate(input.arrival) || !isIsoDate(cancelledOn)) throw new Error('CANCELLATION_DATE_INVALID');
  const snapshot = input.snapshot || DEFAULT_CANCELLATION_TERMS;
  const days = daysBeforeArrival(input.arrival, cancelledOn);
  const refundPercentage = refundPercentageForDays(snapshot, days);
  const paymentsMadePence = input.payments
    .filter((payment) => payment.status === 'verified')
    .reduce((total, payment) => total + Math.max(0, Math.trunc(payment.amountPence)), 0);
  const refundAmountPence = Math.round(paymentsMadePence * refundPercentage / 100);
  return {
    cancelledOn,
    daysBeforeArrival: days,
    refundPercentage,
    paymentsMadePence,
    refundAmountPence,
    retainedAmountPence: paymentsMadePence - refundAmountPence,
    policyVersion: snapshot.policyVersion,
  };
}
