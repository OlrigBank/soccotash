ALTER TABLE plan_ai_capabilities
  ADD COLUMN IF NOT EXISTS read_window_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS read_request_count INTEGER NOT NULL DEFAULT 0 CHECK (read_request_count >= 0),
  ADD COLUMN IF NOT EXISTS proposal_window_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS proposal_request_count INTEGER NOT NULL DEFAULT 0 CHECK (proposal_request_count >= 0);

CREATE TABLE IF NOT EXISTS plan_ai_access_events (
  id BIGSERIAL PRIMARY KEY,
  capability_id BIGINT NOT NULL REFERENCES plan_ai_capabilities(id) ON DELETE CASCADE,
  request_kind TEXT NOT NULL CHECK (request_kind IN ('read','proposal')),
  outcome TEXT NOT NULL CHECK (outcome IN ('granted','expired','booking_inactive','rate_limited')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS plan_ai_access_events_capability_idx
  ON plan_ai_access_events(capability_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS plan_ai_access_events_retention_idx
  ON plan_ai_access_events(occurred_at);
