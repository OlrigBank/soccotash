CREATE TABLE IF NOT EXISTS holiday_plans (
  id BIGSERIAL PRIMARY KEY,
  public_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  plan_type TEXT NOT NULL CHECK (plan_type IN ('example', 'booking_linked')),
  booking_id BIGINT REFERENCES provisional_bookings(id) ON DELETE RESTRICT,
  title TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 3 AND 160),
  description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 5000),
  publication_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (publication_status IN ('draft', 'published', 'unpublished')),
  visibility TEXT NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('private', 'restricted', 'public')),
  starts_on DATE,
  ends_on DATE,
  duration_days INTEGER CHECK (duration_days IS NULL OR duration_days BETWEEN 1 AND 366),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  archived_at TIMESTAMPTZ,
  created_by_admin_user_id BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
  updated_by_admin_user_id BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((starts_on IS NULL) = (ends_on IS NULL)),
  CHECK (starts_on IS NULL OR ends_on >= starts_on),
  CHECK (plan_type = 'booking_linked' OR booking_id IS NULL),
  CHECK (plan_type = 'example' OR booking_id IS NOT NULL),
  CHECK (publication_status = 'published' OR visibility <> 'public')
);

CREATE UNIQUE INDEX IF NOT EXISTS holiday_plans_booking_idx
  ON holiday_plans(booking_id) WHERE booking_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS holiday_plans_type_status_idx
  ON holiday_plans(plan_type, publication_status, updated_at DESC)
  WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS plan_days (
  id BIGSERIAL PRIMARY KEY,
  public_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  holiday_plan_id BIGINT NOT NULL REFERENCES holiday_plans(id) ON DELETE CASCADE,
  day_date DATE,
  title TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 160),
  summary TEXT NOT NULL DEFAULT '' CHECK (char_length(summary) <= 3000),
  position INTEGER NOT NULL CHECK (position >= 0),
  created_by_admin_user_id BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
  updated_by_admin_user_id BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (holiday_plan_id, position)
);

CREATE INDEX IF NOT EXISTS plan_days_plan_idx
  ON plan_days(holiday_plan_id, position);

CREATE TABLE IF NOT EXISTS plan_items (
  id BIGSERIAL PRIMARY KEY,
  public_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  plan_day_id BIGINT NOT NULL REFERENCES plan_days(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 10000),
  item_type TEXT NOT NULL CHECK (item_type IN (
    'activity', 'journey', 'meal', 'reservation', 'free_time', 'other'
  )),
  start_time TIME,
  end_time TIME,
  location_text TEXT CHECK (location_text IS NULL OR char_length(location_text) <= 500),
  local_guide_slug TEXT CHECK (
    local_guide_slug IS NULL OR local_guide_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  ),
  status TEXT NOT NULL DEFAULT 'idea' CHECK (status IN (
    'idea', 'proposed', 'agreed', 'booked', 'completed', 'cancelled'
  )),
  position INTEGER NOT NULL CHECK (position >= 0),
  reservation_note TEXT CHECK (reservation_note IS NULL OR char_length(reservation_note) <= 3000),
  visibility TEXT NOT NULL DEFAULT 'participants'
    CHECK (visibility IN ('participants', 'private', 'public')),
  created_by_admin_user_id BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
  updated_by_admin_user_id BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (start_time IS NULL OR end_time IS NULL OR end_time > start_time),
  UNIQUE (plan_day_id, position)
);

CREATE INDEX IF NOT EXISTS plan_items_day_idx
  ON plan_items(plan_day_id, position);
CREATE INDEX IF NOT EXISTS plan_items_local_guide_idx
  ON plan_items(local_guide_slug) WHERE local_guide_slug IS NOT NULL;

CREATE TABLE IF NOT EXISTS plan_revisions (
  id BIGSERIAL PRIMARY KEY,
  holiday_plan_id BIGINT NOT NULL REFERENCES holiday_plans(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL CHECK (revision > 0),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('administrator', 'guest', 'external_ai', 'system')),
  admin_user_id BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
  source TEXT NOT NULL CHECK (source IN ('admin', 'guest', 'external_ai_proposal', 'system')),
  action TEXT NOT NULL CHECK (char_length(btrim(action)) BETWEEN 1 AND 100),
  summary TEXT NOT NULL CHECK (char_length(btrim(summary)) BETWEEN 1 AND 500),
  changes JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(changes) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (holiday_plan_id, revision),
  CHECK (actor_type <> 'administrator' OR admin_user_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS plan_revisions_plan_idx
  ON plan_revisions(holiday_plan_id, revision DESC);
