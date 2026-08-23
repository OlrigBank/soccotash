ALTER TABLE guide_contribution_candidates
  ADD COLUMN offered_source_url TEXT,
  ADD COLUMN reviewed_source_url TEXT;

ALTER TABLE guide_contribution_candidates
  ADD CONSTRAINT guide_contribution_offered_source_url_check CHECK (
    offered_source_url IS NULL OR (
      char_length(offered_source_url) <= 2000
      AND offered_source_url ~ '^https?://'
    )
  ),
  ADD CONSTRAINT guide_contribution_reviewed_source_url_check CHECK (
    reviewed_source_url IS NULL OR (
      char_length(reviewed_source_url) <= 2000
      AND reviewed_source_url ~ '^https?://'
    )
  );

UPDATE guide_contribution_candidates contribution
   SET offered_source_url = candidate.source_url
  FROM plan_candidate_activities candidate
 WHERE candidate.id = contribution.plan_candidate_activity_id
   AND contribution.offered_source_url IS NULL
   AND candidate.source_url IS NOT NULL;

UPDATE guide_contribution_candidates contribution
   SET offered_source_url = item.source_url
  FROM plan_items item
 WHERE item.id = contribution.plan_item_id
   AND contribution.offered_source_url IS NULL
   AND item.source_url IS NOT NULL;
