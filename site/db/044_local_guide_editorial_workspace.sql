CREATE TABLE local_guide_workspace (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  lock_version INTEGER NOT NULL DEFAULT 1 CHECK (lock_version > 0),
  published_version INTEGER NOT NULL DEFAULT 1 CHECK (published_version > 0),
  updated_by_admin_user_id BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO local_guide_workspace(singleton) VALUES(TRUE);

CREATE TABLE local_guide_categories (
  id TEXT PRIMARY KEY CHECK (id ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  working_label TEXT NOT NULL CHECK (char_length(btrim(working_label)) BETWEEN 1 AND 200),
  working_description TEXT NOT NULL DEFAULT '' CHECK (char_length(working_description) <= 1000),
  working_parent_id TEXT REFERENCES local_guide_categories(id) ON DELETE RESTRICT,
  working_position INTEGER NOT NULL CHECK (working_position > 0),
  working_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  published_label TEXT CHECK (published_label IS NULL OR char_length(btrim(published_label)) BETWEEN 1 AND 200),
  published_description TEXT CHECK (published_description IS NULL OR char_length(published_description) <= 1000),
  published_parent_id TEXT REFERENCES local_guide_categories(id) ON DELETE RESTRICT,
  published_position INTEGER CHECK (published_position IS NULL OR published_position > 0),
  created_by_admin_user_id BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
  updated_by_admin_user_id BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (working_parent_id IS NULL OR working_parent_id <> id),
  CHECK (published_parent_id IS NULL OR published_parent_id <> id),
  CHECK ((published_label IS NULL) = (published_position IS NULL))
);
CREATE UNIQUE INDEX local_guide_categories_working_sibling_position_idx
  ON local_guide_categories(COALESCE(working_parent_id,''),working_position) WHERE NOT working_deleted;
CREATE UNIQUE INDEX local_guide_categories_published_sibling_position_idx
  ON local_guide_categories(COALESCE(published_parent_id,''),published_position) WHERE published_label IS NOT NULL;

INSERT INTO local_guide_categories
  (id,working_label,working_description,working_parent_id,working_position,published_label,published_description,published_parent_id,published_position)
VALUES
 ('home','Home','',NULL,10,'Home','',NULL,10),
 ('whats-on','What’s on','Current event listings and ideas for planning your visit.','home',10,'What’s on','Current event listings and ideas for planning your visit.','home',10),
 ('outdoor-pursuits','Outdoor pursuits','Walks, cycling and outdoor places around Kendal and the wider Lake District.','home',20,'Outdoor pursuits','Walks, cycling and outdoor places around Kendal and the wider Lake District.','home',20),
 ('close-to-home','Close to home','Walks and outdoor places close to Kendal.','outdoor-pursuits',10,'Close to home','Walks and outdoor places close to Kendal.','outdoor-pursuits',10),
 ('further-afield','Further afield','Day trips and outdoor destinations across the wider area.','outdoor-pursuits',20,'Further afield','Day trips and outdoor destinations across the wider area.','outdoor-pursuits',20),
 ('cycling','Cycling','Cycle routes and riding ideas from Kendal.','outdoor-pursuits',30,'Cycling','Cycle routes and riding ideas from Kendal.','outdoor-pursuits',30),
 ('local','In Kendal','Food, drink, culture, activities and independent shops in Kendal.','home',30,'In Kendal','Food, drink, culture, activities and independent shops in Kendal.','home',30),
 ('eating-out','Eating out','Cafés, restaurants and places to eat.','local',10,'Eating out','Cafés, restaurants and places to eat.','local',10),
 ('bars','Bars','Pubs and bars for an evening in Kendal.','local',20,'Bars','Pubs and bars for an evening in Kendal.','local',20),
 ('activities','Activities','Indoor and local activities for your stay.','local',30,'Activities','Indoor and local activities for your stay.','local',30),
 ('exhibitions','Arts and exhibitions','Museums, galleries and exhibitions.','local',40,'Arts and exhibitions','Museums, galleries and exhibitions.','local',40),
 ('shopping','Shopping','Independent food shops and local businesses.','local',50,'Shopping','Independent food shops and local businesses.','local',50),
 ('music','Music','Live music and music events.','local',60,'Music','Live music and music events.','local',60),
 ('pre-owned','Antiques and pre-owned','Antiques, collectables and pre-owned finds.','local',70,'Antiques and pre-owned','Antiques, collectables and pre-owned finds.','local',70),
 ('antiques','Antiques','Antiques and distinctive older pieces.','pre-owned',10,'Antiques','Antiques and distinctive older pieces.','pre-owned',10),
 ('collectables','Collectables','Collectables and unusual finds.','pre-owned',20,'Collectables','Collectables and unusual finds.','pre-owned',20),
 ('festivals','Festivals','Recurring festivals and major events in Kendal.','home',40,'Festivals','Recurring festivals and major events in Kendal.','home',40);

CREATE TABLE local_guide_publications (
  id BIGSERIAL PRIMARY KEY,
  public_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  publication_version INTEGER NOT NULL UNIQUE CHECK (publication_version > 0),
  workspace_version INTEGER NOT NULL CHECK (workspace_version > 0),
  warning_count INTEGER NOT NULL DEFAULT 0 CHECK (warning_count >= 0),
  warnings_acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
  published_by_admin_user_id BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE local_guide_publication_categories (
  publication_id BIGINT NOT NULL REFERENCES local_guide_publications(id) ON DELETE RESTRICT,
  category_id TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT NOT NULL,
  parent_id TEXT,
  position INTEGER NOT NULL,
  PRIMARY KEY(publication_id,category_id)
);
CREATE TABLE local_guide_publication_entries (
  publication_id BIGINT NOT NULL REFERENCES local_guide_publications(id) ON DELETE RESTRICT,
  local_guide_entry_id BIGINT NOT NULL REFERENCES local_guide_entries(id) ON DELETE RESTRICT,
  local_guide_revision_id BIGINT NOT NULL REFERENCES local_guide_revisions(id) ON DELETE RESTRICT,
  PRIMARY KEY(publication_id,local_guide_entry_id)
);

INSERT INTO local_guide_publications(publication_version,workspace_version)
VALUES(1,1);
INSERT INTO local_guide_publication_categories(publication_id,category_id,label,description,parent_id,position)
SELECT 1,id,published_label,published_description,published_parent_id,published_position
FROM local_guide_categories WHERE published_label IS NOT NULL;
INSERT INTO local_guide_publication_entries(publication_id,local_guide_entry_id,local_guide_revision_id)
SELECT 1,id,published_revision_id FROM local_guide_entries WHERE published_revision_id IS NOT NULL;

CREATE TABLE local_guide_url_checks (
  id BIGSERIAL PRIMARY KEY,
  local_guide_entry_id BIGINT NOT NULL REFERENCES local_guide_entries(id) ON DELETE CASCADE,
  local_guide_revision_id BIGINT NOT NULL REFERENCES local_guide_revisions(id) ON DELETE CASCADE,
  url_kind TEXT NOT NULL CHECK (url_kind IN ('website','image')),
  checked_url TEXT NOT NULL CHECK (char_length(checked_url) <= 2000),
  result TEXT NOT NULL CHECK (result IN ('ok','warning')),
  http_status INTEGER,
  failure_code TEXT CHECK (failure_code IS NULL OR char_length(failure_code) <= 100),
  checked_by_admin_user_id BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(local_guide_entry_id,local_guide_revision_id,url_kind)
);
CREATE INDEX local_guide_url_checks_revision_idx ON local_guide_url_checks(local_guide_revision_id,result);

CREATE TABLE local_guide_events_workspace (
  id BIGSERIAL PRIMARY KEY,
  workspace_version INTEGER NOT NULL,
  actor_admin_user_id BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (char_length(btrim(action)) BETWEEN 1 AND 100),
  details JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details)='object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
