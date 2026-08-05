ALTER TABLE plan_participants
  ADD COLUMN IF NOT EXISTS invited_email TEXT,
  ADD COLUMN IF NOT EXISTS access_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS invited_by_participant_id BIGINT REFERENCES plan_participants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS plan_participants_access_token_idx
  ON plan_participants(access_token_hash) WHERE access_token_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS plan_participants_active_email_idx
  ON plan_participants(holiday_plan_id, lower(invited_email))
  WHERE participant_type = 'guest' AND revoked_at IS NULL;

ALTER TABLE plan_revisions
  ADD COLUMN IF NOT EXISTS participant_id BIGINT REFERENCES plan_participants(id) ON DELETE SET NULL;

DO $$ BEGIN
  ALTER TABLE plan_participants ADD CONSTRAINT plan_participants_access_token_hash_check
    CHECK (access_token_hash IS NULL OR access_token_hash ~ '^[0-9a-f]{64}$');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
