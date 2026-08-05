ALTER TABLE plan_ai_proposals
  ADD COLUMN IF NOT EXISTS decided_by_participant_id BIGINT REFERENCES plan_participants(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS decision JSONB;

ALTER TABLE plan_ai_proposals DROP CONSTRAINT IF EXISTS plan_ai_proposals_decision_evidence_check;
ALTER TABLE plan_ai_proposals ADD CONSTRAINT plan_ai_proposals_decision_evidence_check CHECK (
  (status = 'pending' AND decided_at IS NULL AND decided_by_participant_id IS NULL AND decision IS NULL)
  OR
  (status <> 'pending' AND decided_at IS NOT NULL AND decided_by_participant_id IS NOT NULL
    AND jsonb_typeof(decision) = 'object')
);
