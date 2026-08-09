ALTER TABLE plan_candidate_activities
  DROP CONSTRAINT plan_candidate_activities_check;

UPDATE plan_candidate_activities candidate
   SET source_url = revision.external_link,
       updated_at = NOW()
  FROM local_guide_entries entry
  JOIN local_guide_revisions revision ON revision.id = entry.published_revision_id
 WHERE candidate.local_guide_entry_id = entry.id
   AND candidate.source_url IS NULL
   AND revision.external_link ~ '^https?://'
   AND char_length(revision.external_link) <= 2000;

UPDATE plan_items item
   SET source_url = revision.external_link,
       updated_at = NOW()
  FROM local_guide_entries entry
  JOIN local_guide_revisions revision ON revision.id = entry.published_revision_id
 WHERE item.local_guide_entry_id = entry.id
   AND item.source_url IS NULL
   AND revision.external_link ~ '^https?://'
   AND char_length(revision.external_link) <= 2000;
