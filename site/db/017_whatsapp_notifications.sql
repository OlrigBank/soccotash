ALTER TABLE provisional_bookings
  ADD COLUMN IF NOT EXISTS guest_telephone_e164 TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_consent_status TEXT NOT NULL DEFAULT 'not_requested',
  ADD COLUMN IF NOT EXISTS whatsapp_consent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS whatsapp_consent_withdrawn_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS whatsapp_consent_source TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_consent_version TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_consent_number_e164 TEXT;

ALTER TABLE provisional_bookings DROP CONSTRAINT IF EXISTS provisional_bookings_whatsapp_consent_status_check;
ALTER TABLE provisional_bookings ADD CONSTRAINT provisional_bookings_whatsapp_consent_status_check
  CHECK (whatsapp_consent_status IN ('not_requested', 'active', 'withdrawn'));

ALTER TABLE provisional_bookings DROP CONSTRAINT IF EXISTS provisional_bookings_whatsapp_consent_evidence_check;
ALTER TABLE provisional_bookings ADD CONSTRAINT provisional_bookings_whatsapp_consent_evidence_check CHECK (
  whatsapp_consent_status <> 'active' OR (
    whatsapp_consent_at IS NOT NULL AND whatsapp_consent_source IS NOT NULL
    AND whatsapp_consent_version IS NOT NULL AND whatsapp_consent_number_e164 IS NOT NULL
  )
);

CREATE TABLE IF NOT EXISTS booking_notification_events (
  id BIGSERIAL PRIMARY KEY,
  public_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  provisional_booking_id BIGINT NOT NULL REFERENCES provisional_bookings(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  target TEXT NOT NULL CHECK (target IN ('booker', 'administrator')),
  source_key TEXT NOT NULL UNIQUE,
  template_name TEXT,
  template_version TEXT,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS booking_notification_events_booking_idx
  ON booking_notification_events(provisional_booking_id, created_at DESC);

CREATE TABLE IF NOT EXISTS booking_notification_deliveries (
  id BIGSERIAL PRIMARY KEY,
  public_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  notification_event_id BIGINT NOT NULL REFERENCES booking_notification_events(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'whatsapp')),
  provider TEXT,
  recipient_masked TEXT,
  recipient_hash TEXT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (
    status IN ('not_requested', 'queued', 'submitted', 'sent', 'delivered', 'read', 'failed', 'skipped')
  ),
  provider_message_id TEXT,
  fallback_delivery_id BIGINT REFERENCES booking_notification_deliveries(id),
  idempotency_key TEXT NOT NULL UNIQUE,
  submitted_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  error_code TEXT,
  error_detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS booking_notification_deliveries_provider_message_idx
  ON booking_notification_deliveries(provider, provider_message_id)
  WHERE provider_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS booking_notification_status_events (
  id BIGSERIAL PRIMARY KEY,
  delivery_id BIGINT NOT NULL REFERENCES booking_notification_deliveries(id) ON DELETE CASCADE,
  provider_event_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  provider_timestamp TIMESTAMPTZ,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
