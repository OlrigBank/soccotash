CREATE TABLE booker_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE booker_identities (
  channel TEXT NOT NULL CHECK(channel IN ('email','sms')),
  identifier TEXT NOT NULL,
  account_id UUID NOT NULL REFERENCES booker_accounts(id),
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(channel, identifier)
);
CREATE TABLE booker_sessions (
  token_hash TEXT PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES booker_accounts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX booker_sessions_expiry ON booker_sessions(expires_at);
CREATE TABLE booker_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  browser_hash TEXT NOT NULL,
  channel TEXT NOT NULL CHECK(channel IN ('email','sms')),
  identifier TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK(purpose IN ('booking','login')),
  code_hash TEXT,
  provider_id TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  delivered BOOLEAN NOT NULL DEFAULT FALSE,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '10 minutes'
);
CREATE INDEX booker_challenges_browser ON booker_challenges(browser_hash);
CREATE TABLE booker_verification_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  browser_hash TEXT NOT NULL,
  channel TEXT NOT NULL,
  identifier TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 minutes',
  consumed_at TIMESTAMPTZ
);
CREATE TABLE booker_verification_requests (
  destination_hash TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX booker_requests_destination ON booker_verification_requests(destination_hash,created_at);
CREATE INDEX booker_requests_ip ON booker_verification_requests(ip_hash,created_at);
ALTER TABLE provisional_bookings
  ADD COLUMN booker_account_id UUID REFERENCES booker_accounts(id),
  ADD COLUMN booker_claim_channel TEXT,
  ADD COLUMN booker_claim_identifier TEXT;
CREATE INDEX booking_account ON provisional_bookings(booker_account_id);
UPDATE provisional_bookings SET
  booker_claim_channel = CASE WHEN trim(guest_email) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN 'email'
    WHEN guest_telephone_e164 ~ '^\+[1-9][0-9]{6,14}$' THEN 'sms' END,
  booker_claim_identifier = CASE WHEN trim(guest_email) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN lower(trim(guest_email))
    WHEN guest_telephone_e164 ~ '^\+[1-9][0-9]{6,14}$' THEN guest_telephone_e164 END;
CREATE TABLE booker_submissions (
  id UUID PRIMARY KEY,
  browser_hash TEXT NOT NULL,
  booking_id BIGINT NOT NULL REFERENCES provisional_bookings(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES booker_accounts(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
