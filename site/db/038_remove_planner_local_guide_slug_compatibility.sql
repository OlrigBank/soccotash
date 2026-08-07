DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM plan_items WHERE local_guide_slug IS NOT NULL AND local_guide_entry_id IS NULL) THEN
    RAISE EXCEPTION 'Cannot remove planner slug compatibility: unresolved Local Guide references remain';
  END IF;
END $$;

DROP INDEX IF EXISTS plan_items_local_guide_slug_idx;
ALTER TABLE plan_items DROP CONSTRAINT IF EXISTS plan_items_local_guide_reference_pair_check;
ALTER TABLE plan_items DROP COLUMN local_guide_slug;

DROP INDEX IF EXISTS local_guide_entries_migration_source_idx;
ALTER TABLE local_guide_entries DROP COLUMN IF EXISTS migration_source_sha256;
