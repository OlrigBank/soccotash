ALTER TABLE provisional_bookings
  DROP CONSTRAINT IF EXISTS provisional_bookings_status_check;

ALTER TABLE provisional_bookings
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS deposit_pence INTEGER,
  ADD COLUMN IF NOT EXISTS deposit_due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_reported_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_received_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS balance_due_pence INTEGER,
  ADD COLUMN IF NOT EXISTS balance_due_on DATE;

ALTER TABLE provisional_bookings
  ADD CONSTRAINT provisional_bookings_payment_method_check
  CHECK (payment_method IS NULL OR payment_method IN ('gocardless', 'stripe', 'bank_transfer'));

ALTER TABLE provisional_bookings
  ADD CONSTRAINT provisional_bookings_status_check
  CHECK (status IN (
    'pending', 'offered', 'offer_accepted', 'payment_pending', 'payment_reported',
    'confirmed', 'approved', 'declined', 'cancelled', 'expired'
  ));

CREATE INDEX IF NOT EXISTS provisional_bookings_payment_status_idx
  ON provisional_bookings(status, payment_reported_at)
  WHERE status IN ('payment_pending', 'payment_reported');
