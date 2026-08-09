ALTER TABLE plan_participants
  ADD COLUMN guest_password_hash TEXT,
  ADD COLUMN guest_password_set_at TIMESTAMPTZ;

CREATE TABLE guest_plan_sessions (
  id BIGSERIAL PRIMARY KEY,
  participant_id BIGINT NOT NULL REFERENCES plan_participants(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX guest_plan_sessions_participant_idx ON guest_plan_sessions(participant_id);
CREATE INDEX guest_plan_sessions_expiry_idx ON guest_plan_sessions(expires_at);
