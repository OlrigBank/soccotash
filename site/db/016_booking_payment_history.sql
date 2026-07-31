CREATE TABLE IF NOT EXISTS booking_payments (
  id BIGSERIAL PRIMARY KEY,
  public_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  provisional_booking_id BIGINT NOT NULL REFERENCES provisional_bookings(id) ON DELETE CASCADE,
  booking_offer_id BIGINT REFERENCES booking_offers(id) ON DELETE SET NULL,
  stage TEXT NOT NULL CHECK (stage IN ('deposit', 'balance', 'full_payment')),
  amount_pence INTEGER NOT NULL CHECK (amount_pence > 0),
  currency TEXT NOT NULL DEFAULT 'GBP' CHECK (currency ~ '^[A-Z]{3}$'),
  method TEXT NOT NULL CHECK (method IN ('gocardless', 'stripe', 'bank_transfer')),
  status TEXT NOT NULL CHECK (status IN ('reported', 'verified', 'rejected', 'cancelled')),
  reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  cancelled_at TIMESTAMPTZ,
  decision_by_admin_user_id BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
  provider_reference TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT booking_payments_decision_check CHECK (
    (status = 'reported' AND verified_at IS NULL AND rejected_at IS NULL AND cancelled_at IS NULL AND rejection_reason IS NULL)
    OR (status = 'verified' AND verified_at IS NOT NULL AND rejected_at IS NULL AND cancelled_at IS NULL AND rejection_reason IS NULL)
    OR (status = 'rejected' AND verified_at IS NULL AND rejected_at IS NOT NULL AND cancelled_at IS NULL AND NULLIF(btrim(rejection_reason), '') IS NOT NULL)
    OR (status = 'cancelled' AND verified_at IS NULL AND rejected_at IS NULL AND cancelled_at IS NOT NULL AND rejection_reason IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS booking_payments_booking_history_idx
  ON booking_payments(provisional_booking_id, reported_at DESC, id DESC);

CREATE UNIQUE INDEX IF NOT EXISTS booking_payments_one_open_report_idx
  ON booking_payments(provisional_booking_id)
  WHERE status = 'reported';

CREATE UNIQUE INDEX IF NOT EXISTS booking_payments_one_verified_stage_idx
  ON booking_payments(provisional_booking_id, stage)
  WHERE status = 'verified';

-- Reconstruct each legacy report from the immutable activity stream. The next
-- payment decision before another report determines the historical outcome.
WITH legacy_reports AS (
  SELECT report.id AS activity_id,
         report.provisional_booking_id,
         report.booking_offer_id,
         report.created_at AS reported_at,
         decision.event_type AS decision_event,
         decision.details AS decision_details,
         decision.created_at AS decided_at
    FROM booking_activity report
    LEFT JOIN LATERAL (
      SELECT candidate.event_type, candidate.details, candidate.created_at
        FROM booking_activity candidate
       WHERE candidate.provisional_booking_id = report.provisional_booking_id
         AND candidate.created_at >= report.created_at
         AND candidate.id > report.id
         AND candidate.event_type IN (
           'payment_reported',
           'payment_verified_booking_confirmed',
           'payment_report_rejected',
           'booking_cancelled'
         )
       ORDER BY candidate.created_at, candidate.id
       LIMIT 1
    ) decision ON TRUE
   WHERE report.event_type = 'payment_reported'
), prepared AS (
  SELECT legacy_reports.*,
         CASE
           WHEN decision_event = 'payment_verified_booking_confirmed' THEN 'verified'
           WHEN decision_event = 'payment_report_rejected' THEN 'rejected'
           WHEN decision_event = 'booking_cancelled' THEN 'cancelled'
           ELSE 'reported'
         END AS reconstructed_status
    FROM legacy_reports
   WHERE decision_event IS DISTINCT FROM 'payment_reported'
)
INSERT INTO booking_payments (
  provisional_booking_id, booking_offer_id, stage, amount_pence, currency,
  method, status, reported_at, verified_at, rejected_at, rejection_reason,
  cancelled_at, metadata, created_at, updated_at
)
SELECT prepared.provisional_booking_id,
       prepared.booking_offer_id,
       CASE WHEN COALESCE(pb.balance_due_pence, 0) > 0 THEN 'deposit' ELSE 'full_payment' END,
       GREATEST(COALESCE(pb.deposit_pence, pb.guest_total_pence, 1), 1),
       COALESCE(NULLIF(pb.pricing_currency, ''), accepted.currency, 'GBP'),
       COALESCE(NULLIF(pb.payment_method, ''), 'bank_transfer'),
       prepared.reconstructed_status,
       prepared.reported_at,
       CASE WHEN prepared.reconstructed_status = 'verified' THEN prepared.decided_at END,
       CASE WHEN prepared.reconstructed_status = 'rejected' THEN prepared.decided_at END,
       CASE WHEN prepared.reconstructed_status = 'rejected'
         THEN COALESCE(NULLIF(btrim(prepared.decision_details->>'reason'), ''), 'Legacy payment report rejected; no reason was recorded.')
       END,
       CASE WHEN prepared.reconstructed_status = 'cancelled' THEN prepared.decided_at END,
       jsonb_build_object('legacyActivityId', prepared.activity_id),
       prepared.reported_at,
       COALESCE(prepared.decided_at, prepared.reported_at)
  FROM prepared
  JOIN provisional_bookings pb ON pb.id = prepared.provisional_booking_id
  LEFT JOIN LATERAL (
    SELECT bo.currency
      FROM booking_offers bo
     WHERE bo.provisional_booking_id = pb.id AND bo.customer_status = 'accepted'
     ORDER BY bo.id DESC LIMIT 1
  ) accepted ON TRUE
ON CONFLICT DO NOTHING;

-- Some very old rows have legacy timestamps but no corresponding activity.
INSERT INTO booking_payments (
  provisional_booking_id, booking_offer_id, stage, amount_pence, currency,
  method, status, reported_at, verified_at, metadata, created_at, updated_at
)
SELECT pb.id,
       accepted.id,
       CASE WHEN COALESCE(pb.balance_due_pence, 0) > 0 THEN 'deposit' ELSE 'full_payment' END,
       GREATEST(COALESCE(pb.deposit_pence, pb.guest_total_pence, 1), 1),
       COALESCE(NULLIF(pb.pricing_currency, ''), accepted.currency, 'GBP'),
       COALESCE(NULLIF(pb.payment_method, ''), 'bank_transfer'),
       CASE WHEN pb.payment_received_at IS NOT NULL THEN 'verified' ELSE 'reported' END,
       COALESCE(pb.payment_reported_at, pb.payment_received_at),
       pb.payment_received_at,
       jsonb_build_object('legacyTimestampBackfill', true),
       COALESCE(pb.payment_reported_at, pb.payment_received_at),
       COALESCE(pb.payment_received_at, pb.payment_reported_at)
  FROM provisional_bookings pb
  LEFT JOIN LATERAL (
    SELECT bo.id, bo.currency
      FROM booking_offers bo
     WHERE bo.provisional_booking_id = pb.id AND bo.customer_status = 'accepted'
     ORDER BY bo.id DESC LIMIT 1
  ) accepted ON TRUE
 WHERE COALESCE(pb.payment_reported_at, pb.payment_received_at) IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM booking_payments bp WHERE bp.provisional_booking_id = pb.id
   )
ON CONFLICT DO NOTHING;
