ALTER TABLE plan_items
  ADD COLUMN local_guide_entry_id BIGINT REFERENCES local_guide_entries(id) ON DELETE RESTRICT;

UPDATE plan_items item
   SET local_guide_entry_id = entry.id
  FROM local_guide_entries entry
 WHERE item.local_guide_slug IS NOT NULL
   AND lower(item.local_guide_slug) = lower(entry.canonical_slug);

UPDATE plan_items item
   SET local_guide_entry_id = alias.local_guide_entry_id
  FROM local_guide_slug_aliases alias
 WHERE item.local_guide_slug IS NOT NULL
   AND item.local_guide_entry_id IS NULL
   AND lower(item.local_guide_slug) = lower(alias.old_slug);

DO $$
DECLARE
  unresolved_count INTEGER;
  unresolved_slugs TEXT;
BEGIN
  SELECT count(*)::int, string_agg(DISTINCT local_guide_slug, ', ' ORDER BY local_guide_slug)
    INTO unresolved_count, unresolved_slugs
    FROM plan_items
   WHERE local_guide_slug IS NOT NULL AND local_guide_entry_id IS NULL;
  IF unresolved_count > 0 THEN
    RAISE EXCEPTION 'Cannot migrate % unresolved Local Guide plan references: %', unresolved_count, unresolved_slugs;
  END IF;
END;
$$;

ALTER TABLE plan_items
  ADD CONSTRAINT plan_items_local_guide_reference_pair_check
  CHECK ((local_guide_slug IS NULL) = (local_guide_entry_id IS NULL));

CREATE INDEX plan_items_local_guide_entry_idx
  ON plan_items(local_guide_entry_id) WHERE local_guide_entry_id IS NOT NULL;
