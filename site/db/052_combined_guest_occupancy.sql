ALTER TABLE occupancy_rules
  DROP CONSTRAINT IF EXISTS occupancy_rules_subject_check;

ALTER TABLE occupancy_rules
  ADD CONSTRAINT occupancy_rules_subject_check
  CHECK (subject IN ('guests', 'adults', 'children', 'infants', 'pets', 'service_animals'));

-- Adults and children are both guests. Preserve existing policy intent by
-- deriving the initial combined threshold and outcome from the adult rule.
INSERT INTO occupancy_rules
  (policy_id, subject, maximum_standard_count, exceed_outcome)
SELECT
  policy_id,
  'guests',
  maximum_standard_count,
  exceed_outcome
FROM occupancy_rules
WHERE subject = 'adults'
ON CONFLICT (policy_id, subject) DO NOTHING;
