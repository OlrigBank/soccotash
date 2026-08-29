CREATE TABLE IF NOT EXISTS whatsapp_inbound_acknowledgements (
  id BIGSERIAL PRIMARY KEY,
  provider_message_id TEXT NOT NULL UNIQUE,
  provisional_booking_id BIGINT NOT NULL
    REFERENCES provisional_bookings(id) ON DELETE CASCADE,
  recipient_masked TEXT NOT NULL,
  recipient_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'submitted', 'failed', 'suppressed', 'cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lease_expires_at TIMESTAMPTZ,
  response_message_id TEXT,
  last_error TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS whatsapp_inbound_acknowledgements_recipient_idx
  ON whatsapp_inbound_acknowledgements(recipient_hash, received_at DESC);

CREATE INDEX IF NOT EXISTS whatsapp_inbound_acknowledgements_pending_idx
  ON whatsapp_inbound_acknowledgements(available_at, id)
  WHERE status IN ('pending', 'processing', 'failed');
