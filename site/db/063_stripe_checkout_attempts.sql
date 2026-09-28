CREATE TABLE IF NOT EXISTS booking_checkout_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provisional_booking_id BIGINT NOT NULL REFERENCES provisional_bookings(id) ON DELETE CASCADE,
  booking_offer_id BIGINT REFERENCES booking_offers(id) ON DELETE SET NULL,
  stage TEXT NOT NULL CHECK (stage IN ('deposit', 'balance', 'full_payment')),
  amount_pence INTEGER NOT NULL CHECK (amount_pence > 0),
  currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  status TEXT NOT NULL CHECK (status IN ('creating', 'open', 'completed', 'expired', 'failed', 'refund_required', 'refunded')),
  stripe_session_id TEXT UNIQUE,
  stripe_payment_intent_id TEXT,
  stripe_checkout_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS booking_checkout_one_active_stage_idx
  ON booking_checkout_attempts(provisional_booking_id, stage)
  WHERE status IN ('creating', 'open');

CREATE INDEX IF NOT EXISTS booking_checkout_booking_idx
  ON booking_checkout_attempts(provisional_booking_id, created_at DESC);
