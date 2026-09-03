ALTER TABLE airbnb_review_reservation_links
  ADD COLUMN IF NOT EXISTS public_id UUID NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS airbnb_review_reservation_links_public_id_idx
  ON airbnb_review_reservation_links(public_id);

COMMENT ON COLUMN airbnb_review_reservation_links.public_id IS
  'Stable non-sequential identifier used by private administration routes.';
