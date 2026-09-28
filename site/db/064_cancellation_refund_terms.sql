-- E17 snapshots the customer-facing cancellation policy alongside payment terms.
-- Existing accepted bookings receive the launch policy without changing their
-- payment amounts or deadlines.
UPDATE provisional_bookings
   SET payment_terms_snapshot = jsonb_set(
     COALESCE(payment_terms_snapshot, '{}'::jsonb),
     '{cancellationTerms}',
     '{"policyVersion":"e17-v1","maximumGuests":8,"calculationBasis":"verified_payments","refundBands":[{"minimumDaysBeforeArrival":30,"maximumDaysBeforeArrival":null,"refundPercentage":100},{"minimumDaysBeforeArrival":14,"maximumDaysBeforeArrival":29,"refundPercentage":50},{"minimumDaysBeforeArrival":null,"maximumDaysBeforeArrival":13,"refundPercentage":0}],"securityDeposit":null,"processingFeeExcluded":false}'::jsonb,
     true
   )
 WHERE payment_terms_snapshot IS NOT NULL
   AND NOT (payment_terms_snapshot ? 'cancellationTerms');
