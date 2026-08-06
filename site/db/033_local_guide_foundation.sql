CREATE TABLE local_guide_entries (
  id BIGSERIAL PRIMARY KEY,
  public_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  canonical_slug TEXT NOT NULL CHECK (canonical_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  legacy_content_id TEXT,
  legacy_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'unpublished', 'archived')),
  lock_version INTEGER NOT NULL DEFAULT 1 CHECK (lock_version > 0),
  working_revision_id BIGINT,
  published_revision_id BIGINT,
  created_by_admin_user_id BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
  updated_by_admin_user_id BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  unpublished_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, working_revision_id),
  UNIQUE (id, published_revision_id),
  CHECK (status <> 'published' OR published_revision_id IS NOT NULL),
  CHECK (status <> 'draft' OR published_revision_id IS NULL),
  CHECK ((status = 'archived') = (archived_at IS NOT NULL)),
  CHECK (published_at IS NULL OR published_revision_id IS NOT NULL),
  CHECK (unpublished_at IS NULL OR status IN ('unpublished', 'archived'))
);

CREATE UNIQUE INDEX local_guide_entries_slug_ci_idx
  ON local_guide_entries (lower(canonical_slug));
CREATE UNIQUE INDEX local_guide_entries_legacy_content_id_idx
  ON local_guide_entries (legacy_content_id) WHERE legacy_content_id IS NOT NULL;
CREATE INDEX local_guide_entries_status_title_idx
  ON local_guide_entries (status, canonical_slug);

CREATE TABLE local_guide_revisions (
  id BIGSERIAL PRIMARY KEY,
  local_guide_entry_id BIGINT NOT NULL REFERENCES local_guide_entries(id) ON DELETE RESTRICT,
  revision_number INTEGER NOT NULL CHECK (revision_number > 0),
  title TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  summary TEXT NOT NULL DEFAULT '' CHECK (char_length(summary) <= 1000),
  markdown_body TEXT NOT NULL CHECK (char_length(markdown_body) <= 100000),
  body_format TEXT NOT NULL DEFAULT 'markdown' CHECK (body_format = 'markdown'),
  category_id TEXT NOT NULL CHECK (category_id ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  category_label TEXT CHECK (category_label IS NULL OR char_length(btrim(category_label)) BETWEEN 1 AND 200),
  image_path TEXT CHECK (image_path IS NULL OR char_length(image_path) <= 1000),
  external_link TEXT CHECK (external_link IS NULL OR char_length(external_link) <= 2000),
  recommended BOOLEAN NOT NULL DEFAULT FALSE,
  legacy_text TEXT CHECK (legacy_text IS NULL OR char_length(legacy_text) <= 5000),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('system', 'administrator', 'contribution')),
  admin_user_id BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
  source TEXT NOT NULL CHECK (char_length(btrim(source)) BETWEEN 1 AND 100),
  action TEXT NOT NULL CHECK (char_length(btrim(action)) BETWEEN 1 AND 100),
  change_summary JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(change_summary) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (local_guide_entry_id, revision_number),
  UNIQUE (local_guide_entry_id, id),
  CHECK ((actor_type = 'administrator' AND admin_user_id IS NOT NULL) OR actor_type <> 'administrator')
);

ALTER TABLE local_guide_entries
  ADD CONSTRAINT local_guide_entries_working_revision_fk
    FOREIGN KEY (id, working_revision_id)
    REFERENCES local_guide_revisions(local_guide_entry_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT local_guide_entries_published_revision_fk
    FOREIGN KEY (id, published_revision_id)
    REFERENCES local_guide_revisions(local_guide_entry_id, id) ON DELETE RESTRICT;

CREATE INDEX local_guide_revisions_entry_created_idx
  ON local_guide_revisions (local_guide_entry_id, revision_number DESC);

CREATE TABLE local_guide_slug_aliases (
  id BIGSERIAL PRIMARY KEY,
  old_slug TEXT NOT NULL CHECK (old_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  local_guide_entry_id BIGINT NOT NULL REFERENCES local_guide_entries(id) ON DELETE RESTRICT,
  created_by_admin_user_id BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX local_guide_slug_aliases_slug_ci_idx
  ON local_guide_slug_aliases (lower(old_slug));
CREATE INDEX local_guide_slug_aliases_entry_idx
  ON local_guide_slug_aliases (local_guide_entry_id);

CREATE TABLE local_guide_events (
  id BIGSERIAL PRIMARY KEY,
  local_guide_entry_id BIGINT NOT NULL REFERENCES local_guide_entries(id) ON DELETE RESTRICT,
  revision_number INTEGER NOT NULL CHECK (revision_number > 0),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('system', 'administrator', 'contribution')),
  admin_user_id BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
  source TEXT NOT NULL CHECK (char_length(btrim(source)) BETWEEN 1 AND 100),
  action TEXT NOT NULL CHECK (action IN ('created', 'edited', 'published', 'unpublished', 'archived', 'slug_changed')),
  notes TEXT CHECK (notes IS NULL OR char_length(notes) <= 3000),
  details JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((actor_type = 'administrator' AND admin_user_id IS NOT NULL) OR actor_type <> 'administrator')
);

CREATE INDEX local_guide_events_entry_created_idx
  ON local_guide_events (local_guide_entry_id, created_at DESC);

CREATE FUNCTION prevent_local_guide_revision_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Local Guide revisions are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER local_guide_revisions_immutable
  BEFORE UPDATE OR DELETE ON local_guide_revisions
  FOR EACH ROW EXECUTE FUNCTION prevent_local_guide_revision_mutation();

CREATE FUNCTION enforce_local_guide_slug_namespace() RETURNS trigger AS $$
DECLARE
  candidate_slug TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('local-guide-slug-namespace'));
  IF TG_TABLE_NAME = 'local_guide_entries' THEN
    candidate_slug := NEW.canonical_slug;
    IF EXISTS (
      SELECT 1 FROM local_guide_slug_aliases
       WHERE lower(old_slug) = lower(candidate_slug)
    ) THEN
      RAISE EXCEPTION 'Local Guide canonical slug collides with an alias';
    END IF;
  ELSE
    candidate_slug := NEW.old_slug;
    IF EXISTS (
      SELECT 1 FROM local_guide_entries
       WHERE lower(canonical_slug) = lower(candidate_slug)
    ) THEN
      RAISE EXCEPTION 'Local Guide alias collides with a canonical slug';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER local_guide_entry_slug_namespace
  BEFORE INSERT OR UPDATE OF canonical_slug ON local_guide_entries
  FOR EACH ROW EXECUTE FUNCTION enforce_local_guide_slug_namespace();

CREATE TRIGGER local_guide_alias_slug_namespace
  BEFORE INSERT OR UPDATE OF old_slug, local_guide_entry_id ON local_guide_slug_aliases
  FOR EACH ROW EXECUTE FUNCTION enforce_local_guide_slug_namespace();
