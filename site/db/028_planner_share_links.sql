CREATE TABLE IF NOT EXISTS plan_share_links (
  id BIGSERIAL PRIMARY KEY,
  public_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  holiday_plan_id BIGINT NOT NULL REFERENCES holiday_plans(id) ON DELETE CASCADE,
  created_by_participant_id BIGINT NOT NULL REFERENCES plan_participants(id) ON DELETE RESTRICT,
  token_hash TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  last_accessed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (token_hash IS NULL OR token_hash ~ '^[0-9a-f]{64}$'),
  CHECK (expires_at > created_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS plan_share_links_token_idx
  ON plan_share_links(token_hash) WHERE token_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS plan_share_links_plan_idx
  ON plan_share_links(holiday_plan_id, created_at DESC);
