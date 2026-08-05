DO $$ BEGIN
  ALTER TABLE plan_participants ADD CONSTRAINT plan_participants_id_plan_unique
    UNIQUE (id, holiday_plan_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS plan_ai_capabilities (
  id BIGSERIAL PRIMARY KEY,
  public_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  holiday_plan_id BIGINT NOT NULL REFERENCES holiday_plans(id) ON DELETE CASCADE,
  created_by_participant_id BIGINT NOT NULL,
  token_hash TEXT,
  protocol_version TEXT NOT NULL DEFAULT '1.0' CHECK (protocol_version = '1.0'),
  scopes TEXT[] NOT NULL DEFAULT ARRAY['plan:read', 'proposal:submit']::TEXT[],
  created_plan_revision INTEGER NOT NULL CHECK (created_plan_revision > 0),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  last_accessed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (token_hash IS NULL OR token_hash ~ '^[0-9a-f]{64}$'),
  CHECK (scopes = ARRAY['plan:read', 'proposal:submit']::TEXT[]),
  CHECK (expires_at > created_at AND expires_at <= created_at + INTERVAL '24 hours'),
  FOREIGN KEY (created_by_participant_id, holiday_plan_id)
    REFERENCES plan_participants(id, holiday_plan_id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS plan_ai_capabilities_token_idx
  ON plan_ai_capabilities(token_hash) WHERE token_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS plan_ai_capabilities_plan_idx
  ON plan_ai_capabilities(holiday_plan_id, created_at DESC);
