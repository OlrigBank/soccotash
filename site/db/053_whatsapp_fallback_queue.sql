CREATE TABLE IF NOT EXISTS booking_notification_fallback_jobs (
  id BIGSERIAL PRIMARY KEY,
  whatsapp_delivery_id BIGINT NOT NULL UNIQUE
    REFERENCES booking_notification_deliveries(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lease_expires_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS booking_notification_fallback_jobs_pending_idx
  ON booking_notification_fallback_jobs(available_at, id)
  WHERE status IN ('pending', 'processing');
