import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BANK_TRANSFER_REPORTED_NOTICE,
  getBookingPaymentNotice,
  isCurrentPaymentReportResult,
} from '../../src/lib/booking/payment-notice.ts';

test('shows the report result only while payment verification is still pending', () => {
  assert.equal(
    getBookingPaymentNotice('bank-transfer-reported', 'payment_reported'),
    BANK_TRANSFER_REPORTED_NOTICE,
  );
  assert.equal(isCurrentPaymentReportResult('bank-transfer-reported', 'payment_reported'), true);
});

test('hides the stale report result after administrator verification', () => {
  assert.equal(getBookingPaymentNotice('bank-transfer-reported', 'confirmed'), '');
  assert.equal(isCurrentPaymentReportResult('bank-transfer-reported', 'confirmed'), false);
});

test('hides the stale report result after administrator rejection', () => {
  assert.equal(getBookingPaymentNotice('bank-transfer-reported', 'payment_pending'), '');
  assert.equal(isCurrentPaymentReportResult('bank-transfer-reported', 'payment_pending'), false);
});

test('ignores unrelated or absent payment result parameters', () => {
  assert.equal(getBookingPaymentNotice(null, 'payment_reported'), '');
  assert.equal(getBookingPaymentNotice('unknown-result', 'payment_reported'), '');
});
