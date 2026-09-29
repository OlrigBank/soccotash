-- Publication is an explicit decision, independent of importing private evidence.
CREATE TABLE airbnb_review_publications (
  review_id BIGINT PRIMARY KEY REFERENCES airbnb_reviews(id) ON DELETE RESTRICT,
  published BOOLEAN NOT NULL DEFAULT FALSE,
  public_review JSONB NOT NULL CHECK (jsonb_typeof(public_review) = 'object'),
  category_scores JSONB NOT NULL CHECK (jsonb_typeof(category_scores) = 'array' AND jsonb_array_length(category_scores) = 6),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_by BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE airbnb_review_publications IS 'Allowlisted approved public snapshots; private imports are never published automatically.';
