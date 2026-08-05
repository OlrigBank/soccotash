ALTER TABLE guide_contribution_candidates
  ADD COLUMN IF NOT EXISTS reviewed_title TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_description TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_location_text TEXT,
  ADD COLUMN IF NOT EXISTS result_type TEXT,
  ADD COLUMN IF NOT EXISTS result_guide_slug TEXT,
  ADD COLUMN IF NOT EXISTS moderation_notes TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_by_admin_user_id BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

DO $$ BEGIN
  ALTER TABLE guide_contribution_candidates ADD CONSTRAINT guide_contribution_result_type_check
    CHECK (result_type IS NULL OR result_type IN ('new_entry_draft', 'suggested_update'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE guide_contribution_candidates ADD CONSTRAINT guide_contribution_result_slug_check
    CHECK (result_guide_slug IS NULL OR result_guide_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE guide_contribution_candidates ADD CONSTRAINT guide_contribution_review_state_check
    CHECK (
      (status IN ('pending', 'withdrawn') AND reviewed_at IS NULL AND reviewed_by_admin_user_id IS NULL AND result_type IS NULL)
      OR (status = 'rejected' AND reviewed_at IS NOT NULL AND result_type IS NULL AND moderation_notes IS NOT NULL)
      OR (status = 'accepted' AND reviewed_at IS NOT NULL AND result_type IS NOT NULL
          AND result_guide_slug IS NOT NULL AND reviewed_title IS NOT NULL AND reviewed_description IS NOT NULL)
      OR status = 'under_review'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS guide_contribution_new_entry_slug_idx
  ON guide_contribution_candidates(result_guide_slug)
  WHERE status = 'accepted' AND result_type = 'new_entry_draft';
