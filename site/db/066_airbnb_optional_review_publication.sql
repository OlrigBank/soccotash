ALTER TABLE airbnb_reviews ALTER COLUMN published_on DROP NOT NULL;
ALTER TABLE airbnb_reviews ADD COLUMN stay_year_source TEXT
  CHECK (stay_year_source IN ('displayed', 'verified-review', 'reservation', 'current-year-assumption'));

COMMENT ON COLUMN airbnb_reviews.published_on IS
  'Airbnb publication date when known; NULL when omitted by the source and not verified elsewhere.';
COMMENT ON COLUMN airbnb_reviews.stay_year_source IS
  'Evidence used to resolve the stay year; NULL for legacy imports without recorded year provenance.';
