CREATE TABLE IF NOT EXISTS airbnb_import_batches (
  id BIGSERIAL PRIMARY KEY,
  public_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  source_collection TEXT NOT NULL
    CHECK (source_collection IN ('reviews', 'message_archive', 'active_inbox', 'combined', 'mixed')),
  source_snapshot_on DATE NOT NULL,
  importer_schema_version INTEGER NOT NULL CHECK (importer_schema_version > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  expected_count INTEGER NOT NULL CHECK (expected_count >= 0),
  imported_count INTEGER NOT NULL DEFAULT 0 CHECK (imported_count >= 0),
  diagnostics JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(diagnostics) = 'object'),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CHECK (
    (status = 'pending' AND completed_at IS NULL)
    OR (status IN ('completed', 'failed') AND completed_at IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS airbnb_source_documents (
  id BIGSERIAL PRIMARY KEY,
  import_batch_id BIGINT NOT NULL REFERENCES airbnb_import_batches(id) ON DELETE RESTRICT,
  document_type TEXT NOT NULL CHECK (document_type IN ('booking', 'review')),
  relative_path TEXT NOT NULL UNIQUE
    CHECK (relative_path = btrim(relative_path) AND relative_path <> ''
      AND relative_path !~ '^/' AND relative_path !~ '(^|/)\.\.(/|$)'),
  sha256 TEXT NOT NULL UNIQUE CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  source_external_id TEXT NOT NULL CHECK (source_external_id ~ '^[0-9]+$'),
  page_count INTEGER NOT NULL CHECK (page_count > 0),
  captured_at TIMESTAMPTZ NOT NULL,
  raw_extraction JSONB NOT NULL CHECK (jsonb_typeof(raw_extraction) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, document_type)
);

CREATE INDEX IF NOT EXISTS airbnb_source_documents_batch_idx
  ON airbnb_source_documents(import_batch_id, document_type, id);
CREATE INDEX IF NOT EXISTS airbnb_source_documents_external_id_idx
  ON airbnb_source_documents(document_type, source_external_id);

CREATE TABLE IF NOT EXISTS airbnb_reservations (
  id BIGSERIAL PRIMARY KEY,
  public_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  conversation_id TEXT NOT NULL UNIQUE CHECK (conversation_id ~ '^[0-9]+$'),
  confirmation_code TEXT,
  property_id TEXT,
  source_listing_name TEXT NOT NULL CHECK (length(btrim(source_listing_name)) BETWEEN 1 AND 300),
  booker_display_name TEXT NOT NULL CHECK (length(btrim(booker_display_name)) BETWEEN 1 AND 200),
  party_display_name TEXT,
  arrival DATE NOT NULL,
  departure DATE NOT NULL,
  nights INTEGER NOT NULL CHECK (nights > 0),
  check_in_time TIME,
  check_out_time TIME,
  party_size INTEGER CHECK (party_size IS NULL OR party_size > 0),
  adults INTEGER CHECK (adults IS NULL OR adults >= 0),
  children INTEGER CHECK (children IS NULL OR children >= 0),
  infants INTEGER CHECK (infants IS NULL OR infants >= 0),
  pets INTEGER CHECK (pets IS NULL OR pets >= 0),
  booking_date DATE,
  source_status_text TEXT,
  cancellation_policy TEXT NOT NULL CHECK (length(btrim(cancellation_policy)) BETWEEN 1 AND 200),
  currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  headline_host_total_minor BIGINT CHECK (headline_host_total_minor IS NULL OR headline_host_total_minor >= 0),
  source_captured_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (departure > arrival),
  CHECK (departure - arrival = nights),
  CHECK (party_display_name IS NULL OR length(btrim(party_display_name)) BETWEEN 1 AND 300),
  CHECK (confirmation_code IS NULL OR length(btrim(confirmation_code)) BETWEEN 1 AND 100),
  CHECK (property_id IS NULL OR length(btrim(property_id)) BETWEEN 1 AND 100)
);

CREATE UNIQUE INDEX IF NOT EXISTS airbnb_reservations_confirmation_code_idx
  ON airbnb_reservations(confirmation_code) WHERE confirmation_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS airbnb_reservations_stay_idx
  ON airbnb_reservations(arrival, departure, property_id);

CREATE TABLE IF NOT EXISTS airbnb_reservation_private_details (
  reservation_id BIGINT PRIMARY KEY REFERENCES airbnb_reservations(id) ON DELETE CASCADE,
  host_notes TEXT,
  guest_profile_text TEXT,
  access_code_ciphertext BYTEA,
  access_code_key_version INTEGER,
  access_code_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (access_code_ciphertext IS NULL AND access_code_key_version IS NULL AND access_code_expires_at IS NULL)
    OR (access_code_ciphertext IS NOT NULL AND access_code_key_version > 0)
  )
);

CREATE TABLE IF NOT EXISTS airbnb_reservation_documents (
  reservation_id BIGINT NOT NULL REFERENCES airbnb_reservations(id) ON DELETE CASCADE,
  source_document_id BIGINT NOT NULL UNIQUE,
  source_document_type TEXT NOT NULL DEFAULT 'booking' CHECK (source_document_type = 'booking'),
  is_preferred BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (reservation_id, source_document_id),
  FOREIGN KEY (source_document_id, source_document_type)
    REFERENCES airbnb_source_documents(id, document_type) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS airbnb_reservation_documents_preferred_idx
  ON airbnb_reservation_documents(reservation_id) WHERE is_preferred;

CREATE TABLE IF NOT EXISTS airbnb_conversation_entries (
  id BIGSERIAL PRIMARY KEY,
  public_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  reservation_id BIGINT NOT NULL REFERENCES airbnb_reservations(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 0),
  entry_type TEXT NOT NULL CHECK (entry_type IN ('message', 'service_event')),
  sender_type TEXT NOT NULL CHECK (sender_type IN ('guest', 'host', 'airbnb', 'unknown')),
  sender_display_name TEXT NOT NULL CHECK (length(btrim(sender_display_name)) BETWEEN 1 AND 200),
  body TEXT NOT NULL CHECK (length(btrim(body)) > 0),
  displayed_date TEXT NOT NULL CHECK (length(btrim(displayed_date)) BETWEEN 1 AND 100),
  displayed_time TEXT NOT NULL CHECK (length(btrim(displayed_time)) BETWEEN 1 AND 100),
  sent_at TIMESTAMPTZ,
  timestamp_precision TEXT NOT NULL
    CHECK (timestamp_precision IN ('exact', 'date_inferred', 'year_unknown', 'unresolved')),
  raw_entry JSONB NOT NULL CHECK (jsonb_typeof(raw_entry) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (reservation_id, position),
  CHECK (
    (timestamp_precision IN ('exact', 'date_inferred') AND sent_at IS NOT NULL)
    OR (timestamp_precision IN ('year_unknown', 'unresolved') AND sent_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS airbnb_conversation_entries_reservation_idx
  ON airbnb_conversation_entries(reservation_id, position);

CREATE TABLE IF NOT EXISTS airbnb_conversation_reactions (
  id BIGSERIAL PRIMARY KEY,
  conversation_entry_id BIGINT NOT NULL REFERENCES airbnb_conversation_entries(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 0),
  reaction TEXT NOT NULL CHECK (length(btrim(reaction)) BETWEEN 1 AND 100),
  reactor_display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (conversation_entry_id, position),
  CHECK (reactor_display_name IS NULL OR length(btrim(reactor_display_name)) BETWEEN 1 AND 200)
);

CREATE TABLE IF NOT EXISTS airbnb_financial_summaries (
  id BIGSERIAL PRIMARY KEY,
  reservation_id BIGINT NOT NULL REFERENCES airbnb_reservations(id) ON DELETE CASCADE,
  perspective TEXT NOT NULL CHECK (perspective IN ('host_earnings', 'guest_paid')),
  currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  total_minor BIGINT NOT NULL,
  arithmetic_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (arithmetic_status IN ('pending', 'verified', 'not_determinable', 'discrepancy')),
  arithmetic_difference_minor BIGINT,
  raw_display_text TEXT NOT NULL CHECK (length(btrim(raw_display_text)) > 0),
  captured_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (reservation_id, perspective),
  CHECK (
    (arithmetic_status = 'discrepancy' AND arithmetic_difference_minor IS NOT NULL)
    OR (arithmetic_status <> 'discrepancy' AND arithmetic_difference_minor IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS airbnb_financial_line_items (
  id BIGSERIAL PRIMARY KEY,
  financial_summary_id BIGINT NOT NULL REFERENCES airbnb_financial_summaries(id) ON DELETE CASCADE,
  parent_line_item_id BIGINT,
  position INTEGER NOT NULL CHECK (position >= 0),
  item_type TEXT NOT NULL
    CHECK (item_type IN ('accommodation', 'nightly_charge', 'adjustment', 'host_service_fee',
      'guest_service_fee', 'tax', 'total', 'other')),
  description TEXT NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 500),
  service_date DATE,
  quantity NUMERIC CHECK (quantity IS NULL OR quantity > 0),
  unit_amount_minor BIGINT,
  amount_minor BIGINT NOT NULL,
  raw_display_text TEXT NOT NULL CHECK (length(btrim(raw_display_text)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (financial_summary_id, position),
  UNIQUE (id, financial_summary_id),
  FOREIGN KEY (parent_line_item_id, financial_summary_id)
    REFERENCES airbnb_financial_line_items(id, financial_summary_id) ON DELETE CASCADE,
  CHECK (parent_line_item_id IS NULL OR parent_line_item_id <> id)
);

CREATE TABLE IF NOT EXISTS airbnb_reviews (
  id BIGSERIAL PRIMARY KEY,
  public_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  review_id TEXT NOT NULL UNIQUE CHECK (review_id ~ '^[0-9]+$'),
  source_document_id BIGINT NOT NULL UNIQUE,
  source_document_type TEXT NOT NULL DEFAULT 'review' CHECK (source_document_type = 'review'),
  reviewer_display_name TEXT NOT NULL CHECK (length(btrim(reviewer_display_name)) BETWEEN 1 AND 200),
  property_id TEXT,
  source_listing_name TEXT NOT NULL CHECK (length(btrim(source_listing_name)) BETWEEN 1 AND 300),
  arrival DATE NOT NULL,
  departure DATE NOT NULL,
  nights INTEGER NOT NULL CHECK (nights > 0),
  published_on DATE NOT NULL,
  overall_rating SMALLINT NOT NULL CHECK (overall_rating BETWEEN 1 AND 5),
  public_text TEXT NOT NULL CHECK (length(btrim(public_text)) > 0),
  private_feedback TEXT,
  captured_on DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (departure > arrival),
  CHECK (departure - arrival = nights),
  CHECK (property_id IS NULL OR length(btrim(property_id)) BETWEEN 1 AND 100),
  CHECK (private_feedback IS NULL OR length(btrim(private_feedback)) > 0),
  FOREIGN KEY (source_document_id, source_document_type)
    REFERENCES airbnb_source_documents(id, document_type) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS airbnb_reviews_stay_idx
  ON airbnb_reviews(arrival, departure, property_id);
CREATE INDEX IF NOT EXISTS airbnb_reviews_published_idx
  ON airbnb_reviews(published_on DESC, id DESC);

CREATE TABLE IF NOT EXISTS airbnb_review_category_ratings (
  id BIGSERIAL PRIMARY KEY,
  review_id BIGINT NOT NULL REFERENCES airbnb_reviews(id) ON DELETE CASCADE,
  category_key TEXT NOT NULL CHECK (category_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  category_display_name TEXT NOT NULL CHECK (length(btrim(category_display_name)) BETWEEN 1 AND 100),
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  position INTEGER NOT NULL CHECK (position >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (review_id, category_key),
  UNIQUE (review_id, position)
);

CREATE TABLE IF NOT EXISTS airbnb_review_feedback_tags (
  id BIGSERIAL PRIMARY KEY,
  category_rating_id BIGINT NOT NULL REFERENCES airbnb_review_category_ratings(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 0),
  feedback_text TEXT NOT NULL CHECK (length(btrim(feedback_text)) BETWEEN 1 AND 300),
  normalized_key TEXT NOT NULL CHECK (length(btrim(normalized_key)) BETWEEN 1 AND 300),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (category_rating_id, position),
  UNIQUE (category_rating_id, normalized_key)
);

CREATE TABLE IF NOT EXISTS airbnb_review_reservation_links (
  id BIGSERIAL PRIMARY KEY,
  review_id BIGINT NOT NULL REFERENCES airbnb_reviews(id) ON DELETE CASCADE,
  reservation_id BIGINT NOT NULL REFERENCES airbnb_reservations(id) ON DELETE CASCADE,
  link_status TEXT NOT NULL DEFAULT 'proposed' CHECK (link_status IN ('proposed', 'confirmed', 'rejected')),
  match_method TEXT NOT NULL
    CHECK (match_method IN ('stay_listing_identity', 'confirmation_code', 'manual', 'other')),
  confidence NUMERIC(5,4) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  evidence JSONB NOT NULL CHECK (jsonb_typeof(evidence) = 'object'),
  decision_source TEXT CHECK (decision_source IS NULL OR decision_source IN ('automatic', 'manual')),
  reviewed_by_admin_user_id BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (review_id, reservation_id),
  CHECK (
    (link_status = 'proposed' AND decision_source IS NULL AND reviewed_by_admin_user_id IS NULL AND reviewed_at IS NULL)
    OR (link_status IN ('confirmed', 'rejected') AND decision_source = 'automatic'
      AND reviewed_by_admin_user_id IS NULL AND reviewed_at IS NOT NULL)
    OR (link_status IN ('confirmed', 'rejected') AND decision_source = 'manual'
      AND reviewed_by_admin_user_id IS NOT NULL AND reviewed_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS airbnb_review_reservation_links_status_idx
  ON airbnb_review_reservation_links(link_status, confidence DESC, id);

COMMENT ON TABLE airbnb_import_batches IS
  'Private audit record for bounded imports of locally captured Airbnb evidence.';
COMMENT ON TABLE airbnb_source_documents IS
  'Immutable provenance for private Airbnb PDFs; binary PDF content remains outside PostgreSQL.';
COMMENT ON COLUMN airbnb_source_documents.raw_extraction IS
  'Lossless private parsed payload; never serialize through public routes or ordinary logs.';
COMMENT ON TABLE airbnb_reservations IS
  'Canonical imported Airbnb history, deliberately separate from the live provisional_bookings lifecycle.';
COMMENT ON TABLE airbnb_reservation_private_details IS
  'Restricted Airbnb host notes, profile details and encrypted access material.';
COMMENT ON COLUMN airbnb_reservation_private_details.access_code_ciphertext IS
  'Application-encrypted access code; plaintext must never be persisted or logged.';
COMMENT ON TABLE airbnb_conversation_entries IS
  'Private imported guest, host and Airbnb service conversation history.';
COMMENT ON TABLE airbnb_financial_summaries IS
  'Private Airbnb host-earnings and guest-paid totals stored in integer minor units.';
COMMENT ON TABLE airbnb_reviews IS
  'Private canonical Airbnb review records, including private guest feedback when captured.';
COMMENT ON TABLE airbnb_review_reservation_links IS
  'Auditable proposed or decided links; guest name alone is insufficient evidence.';
