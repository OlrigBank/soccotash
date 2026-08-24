CREATE TABLE IF NOT EXISTS occupancy_policies (
  id BIGSERIAL PRIMARY KEY,
  property_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  version INTEGER NOT NULL CHECK (version > 0),
  based_on_policy_id BIGINT REFERENCES occupancy_policies(id) ON DELETE SET NULL,
  created_by BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
  published_by BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (property_id, version)
);

CREATE UNIQUE INDEX IF NOT EXISTS occupancy_policies_one_published_per_property_idx
  ON occupancy_policies(property_id) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS occupancy_policies_property_idx
  ON occupancy_policies(property_id, status, version DESC);

CREATE TABLE IF NOT EXISTS occupancy_rules (
  id BIGSERIAL PRIMARY KEY,
  policy_id BIGINT NOT NULL REFERENCES occupancy_policies(id) ON DELETE CASCADE,
  subject TEXT NOT NULL
    CHECK (subject IN ('adults', 'children', 'infants', 'pets', 'service_animals')),
  maximum_standard_count INTEGER NOT NULL CHECK (maximum_standard_count >= 0),
  exceed_outcome TEXT NOT NULL
    CHECK (exceed_outcome IN ('bespoke', 'host_decision_required')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (policy_id, subject)
);

CREATE TABLE IF NOT EXISTS occupancy_policy_events (
  id BIGSERIAL PRIMARY KEY,
  policy_id BIGINT NOT NULL REFERENCES occupancy_policies(id) ON DELETE CASCADE,
  admin_user_id BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('created', 'duplicated', 'rule_updated', 'published', 'archived')),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS occupancy_policy_events_policy_idx
  ON occupancy_policy_events(policy_id, created_at DESC, id DESC);

-- These intentionally incomplete drafts make each current stay arrangement
-- visible for review without silently inventing live occupancy policy.
INSERT INTO occupancy_policies (property_id, name, status, version)
VALUES
  ('main-house', 'Olrig Bank — occupancy policy draft', 'draft', 1),
  ('whole-property', 'Olrig Bank Max — occupancy policy draft', 'draft', 1),
  ('cottage', 'The Cottage at Olrig Bank — occupancy policy draft', 'draft', 1),
  ('bespoke-arrangement', 'Bespoke stay — occupancy policy draft', 'draft', 1)
ON CONFLICT (property_id, version) DO NOTHING;
