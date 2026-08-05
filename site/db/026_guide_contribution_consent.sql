CREATE TABLE IF NOT EXISTS guide_contribution_candidates (
  id BIGSERIAL PRIMARY KEY,
  public_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  holiday_plan_id BIGINT NOT NULL REFERENCES holiday_plans(id) ON DELETE CASCADE,
  plan_item_id BIGINT REFERENCES plan_items(id) ON DELETE SET NULL,
  submitted_by_participant_id BIGINT NOT NULL REFERENCES plan_participants(id) ON DELETE RESTRICT,
  offered_title TEXT NOT NULL CHECK (char_length(btrim(offered_title)) BETWEEN 1 AND 200),
  offered_description TEXT NOT NULL CHECK (char_length(offered_description) <= 5000),
  offered_location_text TEXT CHECK (offered_location_text IS NULL OR char_length(offered_location_text) <= 500),
  consent_version TEXT NOT NULL CHECK (char_length(btrim(consent_version)) BETWEEN 1 AND 100),
  consent_statement TEXT NOT NULL CHECK (char_length(btrim(consent_statement)) BETWEEN 1 AND 500),
  consented_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attribution_permitted BOOLEAN NOT NULL DEFAULT FALSE,
  attribution_name TEXT CHECK (attribution_name IS NULL OR char_length(btrim(attribution_name)) BETWEEN 1 AND 160),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'withdrawn', 'under_review', 'accepted', 'rejected')),
  withdrawn_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (attribution_permitted OR attribution_name IS NULL),
  CHECK ((status = 'withdrawn') = (withdrawn_at IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS guide_contribution_active_item_idx
  ON guide_contribution_candidates(plan_item_id)
  WHERE plan_item_id IS NOT NULL AND status IN ('pending', 'under_review', 'accepted');
CREATE INDEX IF NOT EXISTS guide_contribution_status_idx
  ON guide_contribution_candidates(status, created_at);
