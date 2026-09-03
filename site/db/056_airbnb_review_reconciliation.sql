CREATE UNIQUE INDEX IF NOT EXISTS airbnb_review_reservation_links_one_confirmed_review_idx
  ON airbnb_review_reservation_links(review_id)
  WHERE link_status = 'confirmed';

CREATE UNIQUE INDEX IF NOT EXISTS airbnb_review_reservation_links_one_confirmed_reservation_idx
  ON airbnb_review_reservation_links(reservation_id)
  WHERE link_status = 'confirmed';

COMMENT ON TABLE airbnb_review_reservation_links IS
  'Private, evidence-backed review/reservation candidates. Manual decisions are immutable and audited.';
