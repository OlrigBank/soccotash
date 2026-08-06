ALTER TABLE guide_contribution_candidates
  ADD COLUMN reviewed_category_id TEXT,
  ADD COLUMN result_local_guide_entry_id BIGINT REFERENCES local_guide_entries(id) ON DELETE RESTRICT,
  ADD COLUMN result_local_guide_revision_id BIGINT REFERENCES local_guide_revisions(id) ON DELETE RESTRICT;

ALTER TABLE local_guide_events DROP CONSTRAINT local_guide_events_action_check;
ALTER TABLE local_guide_events ADD CONSTRAINT local_guide_events_action_check
  CHECK (action IN ('created','edited','published','unpublished','archived','slug_changed','revision_restored','contribution_accepted'));

DO $reconcile_contributions$
DECLARE candidate RECORD; entry_id BIGINT; revision_id BIGINT; next_revision INTEGER; category_id TEXT;
BEGIN
  FOR candidate IN SELECT * FROM guide_contribution_candidates WHERE status='accepted' ORDER BY id FOR UPDATE LOOP
    SELECT e.id INTO entry_id FROM local_guide_entries e LEFT JOIN local_guide_slug_aliases a ON a.local_guide_entry_id=e.id
      WHERE lower(e.canonical_slug)=lower(candidate.result_guide_slug) OR lower(a.old_slug)=lower(candidate.result_guide_slug) LIMIT 1;
    IF candidate.result_type='new_entry_draft' THEN
      IF entry_id IS NOT NULL THEN RAISE EXCEPTION 'Accepted new-entry contribution slug % already exists', candidate.result_guide_slug; END IF;
      INSERT INTO local_guide_entries(canonical_slug,status,created_by_admin_user_id,updated_by_admin_user_id)
        VALUES(candidate.result_guide_slug,'draft',candidate.reviewed_by_admin_user_id,candidate.reviewed_by_admin_user_id) RETURNING id INTO entry_id;
      next_revision:=1; category_id:=COALESCE(candidate.reviewed_category_id,'activities');
    ELSE
      IF entry_id IS NULL THEN RAISE EXCEPTION 'Accepted update contribution slug % is unresolved', candidate.result_guide_slug; END IF;
      SELECT lock_version+1,COALESCE(candidate.reviewed_category_id,r.category_id) INTO next_revision,category_id
        FROM local_guide_entries e JOIN local_guide_revisions r ON r.id=e.working_revision_id WHERE e.id=entry_id FOR UPDATE OF e;
    END IF;
    INSERT INTO local_guide_revisions(local_guide_entry_id,revision_number,title,summary,markdown_body,category_id,category_label,image_path,external_link,recommended,legacy_text,actor_type,admin_user_id,source,action,change_summary)
      SELECT entry_id,next_revision,candidate.reviewed_title,left(candidate.reviewed_description,1000),candidate.reviewed_description||CASE WHEN candidate.reviewed_location_text IS NULL THEN '' ELSE E'\n\nLocation: '||candidate.reviewed_location_text END,
        category_id,CASE WHEN candidate.result_type='suggested_update' THEN r.category_label END,CASE WHEN candidate.result_type='suggested_update' THEN r.image_path END,
        CASE WHEN candidate.result_type='suggested_update' THEN r.external_link END,CASE WHEN candidate.result_type='suggested_update' THEN r.recommended ELSE FALSE END,NULL,
        'contribution',candidate.reviewed_by_admin_user_id,'planner_contribution','contribution_accepted',jsonb_build_object('candidateId',candidate.public_id,'consentVersion',candidate.consent_version,'consentedAt',candidate.consented_at,'attributionPermitted',candidate.attribution_permitted,'attributionName',candidate.attribution_name)
      FROM (SELECT NULL::text category_label,NULL::text image_path,NULL::text external_link,FALSE recommended WHERE candidate.result_type='new_entry_draft'
            UNION ALL SELECT r.category_label,r.image_path,r.external_link,r.recommended FROM local_guide_entries e JOIN local_guide_revisions r ON r.id=e.working_revision_id WHERE e.id=entry_id AND candidate.result_type='suggested_update') r
      RETURNING id INTO revision_id;
    UPDATE local_guide_entries SET working_revision_id=revision_id,lock_version=next_revision,updated_by_admin_user_id=candidate.reviewed_by_admin_user_id,updated_at=NOW() WHERE id=entry_id;
    INSERT INTO local_guide_events(local_guide_entry_id,revision_number,actor_type,admin_user_id,source,action,details)
      VALUES(entry_id,next_revision,'contribution',candidate.reviewed_by_admin_user_id,'planner_contribution','contribution_accepted',jsonb_build_object('candidateId',candidate.public_id));
    UPDATE guide_contribution_candidates SET reviewed_category_id=category_id,result_local_guide_entry_id=entry_id,result_local_guide_revision_id=revision_id WHERE id=candidate.id;
  END LOOP;
END $reconcile_contributions$;

ALTER TABLE guide_contribution_candidates ADD CONSTRAINT guide_contribution_result_links_check CHECK (
  (status='accepted' AND result_local_guide_entry_id IS NOT NULL AND result_local_guide_revision_id IS NOT NULL)
  OR (status<>'accepted' AND result_local_guide_entry_id IS NULL AND result_local_guide_revision_id IS NULL));
CREATE UNIQUE INDEX guide_contribution_result_revision_idx ON guide_contribution_candidates(result_local_guide_revision_id) WHERE result_local_guide_revision_id IS NOT NULL;
