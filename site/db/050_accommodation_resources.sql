CREATE TABLE IF NOT EXISTS accommodation_resources (
  id BIGSERIAL PRIMARY KEY,
  stable_key TEXT NOT NULL UNIQUE CHECK (stable_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  display_name TEXT NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 160),
  sleeping_capacity INTEGER NOT NULL DEFAULT 0 CHECK (sleeping_capacity >= 0),
  availability_property_id TEXT,
  practical_notes TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS accommodation_bundles (
  id BIGSERIAL PRIMARY KEY,
  public_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  stable_key TEXT NOT NULL UNIQUE CHECK (stable_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  display_name TEXT NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 160),
  practical_notes TEXT,
  standard_arrangement BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS accommodation_bundle_resources (
  bundle_id BIGINT NOT NULL REFERENCES accommodation_bundles(id) ON DELETE CASCADE,
  resource_id BIGINT NOT NULL REFERENCES accommodation_resources(id) ON DELETE RESTRICT,
  position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0), PRIMARY KEY(bundle_id,resource_id)
);
CREATE TABLE IF NOT EXISTS accommodation_property_bundles (
  property_id TEXT PRIMARY KEY,
  bundle_id BIGINT NOT NULL REFERENCES accommodation_bundles(id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS accommodation_resource_events (
  id BIGSERIAL PRIMARY KEY,
  admin_user_id BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK(action IN ('resource_updated','bundle_created','bundle_updated')),
  resource_id BIGINT REFERENCES accommodation_resources(id) ON DELETE SET NULL,
  bundle_id BIGINT REFERENCES accommodation_bundles(id) ON DELETE SET NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO accommodation_resources(stable_key,display_name,sleeping_capacity,availability_property_id,practical_notes) VALUES
 ('olrig-bank-core','Olrig Bank core accommodation',8,'main-house','Four bedrooms and the shared main-house facilities.'),
 ('rear-bedroom-5','Rear bedroom 5',2,'cottage','Can contribute two adult sleeping places when host-approved.'),
 ('rear-bedroom-6','Rear bedroom 6',2,'cottage','Can contribute two adult sleeping places when host-approved.'),
 ('rear-bathroom-wc-landing','Rear bathroom, WC and landing',0,'cottage','Facilities required with the rear bedrooms; no sleeping capacity.'),
 ('cottage-independent-living','Cottage independent living space',0,'cottage','Distinguishes an independent Cottage stay from bedroom use within Olrig Bank Max.')
ON CONFLICT(stable_key) DO NOTHING;

INSERT INTO accommodation_bundles(stable_key,display_name,practical_notes,standard_arrangement) VALUES
 ('olrig-bank','Olrig Bank','Public Olrig Bank arrangement.',TRUE),
 ('olrig-bank-max','Olrig Bank Max','Uses the rear bedrooms and facilities; resource availability is advisory until allocation is connected.',TRUE),
 ('cottage-independent','The Cottage at Olrig Bank','Independent Cottage arrangement including its living space.',TRUE),
 ('bespoke-host-approved','Bespoke host-approved arrangement','Starting bundle for a host-approved selection; not automatically suitable or available.',FALSE)
ON CONFLICT(stable_key) DO NOTHING;

INSERT INTO accommodation_bundle_resources(bundle_id,resource_id,position)
SELECT b.id,r.id,v.position FROM (VALUES
 ('olrig-bank','olrig-bank-core',0),
 ('olrig-bank-max','olrig-bank-core',0),('olrig-bank-max','rear-bedroom-5',1),('olrig-bank-max','rear-bedroom-6',2),('olrig-bank-max','rear-bathroom-wc-landing',3),
 ('cottage-independent','rear-bedroom-5',0),('cottage-independent','rear-bedroom-6',1),('cottage-independent','rear-bathroom-wc-landing',2),('cottage-independent','cottage-independent-living',3)
) AS v(bundle_key,resource_key,position)
JOIN accommodation_bundles b ON b.stable_key=v.bundle_key JOIN accommodation_resources r ON r.stable_key=v.resource_key
ON CONFLICT(bundle_id,resource_id) DO NOTHING;

INSERT INTO accommodation_property_bundles(property_id,bundle_id)
SELECT v.property_id,b.id FROM (VALUES ('main-house','olrig-bank'),('whole-property','olrig-bank-max'),('cottage','cottage-independent'),('bespoke-arrangement','bespoke-host-approved')) v(property_id,bundle_key)
JOIN accommodation_bundles b ON b.stable_key=v.bundle_key ON CONFLICT(property_id) DO NOTHING;

COMMENT ON TABLE accommodation_resources IS 'Stable conflict/capacity-bearing spaces; descriptive amenities remain outside this model.';
COMMENT ON TABLE accommodation_property_bundles IS 'Compatibility mapping only; current property/calendar blocking remains authoritative until allocation is implemented.';
