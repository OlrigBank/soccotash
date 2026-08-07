CREATE TABLE IF NOT EXISTS plan_ai_proposals (
  id BIGSERIAL PRIMARY KEY,
  public_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  holiday_plan_id BIGINT NOT NULL REFERENCES holiday_plans(id) ON DELETE CASCADE,
  capability_id BIGINT NOT NULL REFERENCES plan_ai_capabilities(id) ON DELETE RESTRICT,
  protocol_version TEXT NOT NULL CHECK (protocol_version = '1.0'),
  source_revision INTEGER NOT NULL CHECK (source_revision > 0),
  received_revision INTEGER NOT NULL CHECK (received_revision > 0),
  proposal JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','partially_accepted','rejected')),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ,
  CHECK (jsonb_typeof(proposal) = 'object')
);
CREATE INDEX IF NOT EXISTS plan_ai_proposals_plan_idx ON plan_ai_proposals(holiday_plan_id, submitted_at DESC);
ALTER TABLE plan_ai_capabilities ADD COLUMN IF NOT EXISTS last_proposal_at TIMESTAMPTZ;
