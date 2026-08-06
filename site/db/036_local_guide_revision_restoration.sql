ALTER TABLE local_guide_events
  DROP CONSTRAINT local_guide_events_action_check,
  ADD CONSTRAINT local_guide_events_action_check
    CHECK (action IN ('created', 'edited', 'published', 'unpublished', 'archived', 'slug_changed', 'revision_restored'));
