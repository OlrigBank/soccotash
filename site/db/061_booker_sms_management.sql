-- Fail visibly if pre-existing data violates the new invariant; never remove identities.
CREATE UNIQUE INDEX booker_one_sms_identity ON booker_identities(account_id) WHERE channel='sms';
CREATE TABLE booker_mobile_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES booker_accounts(id) ON DELETE CASCADE,
  session_hash TEXT NOT NULL,
  browser_hash TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('add','replace','remove')),
  identifier TEXT,
  previous_identifier TEXT,
  email_identifier TEXT NOT NULL,
  email_verified_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '10 minutes',
  CHECK ((action='remove' AND identifier IS NULL) OR (action<>'remove' AND identifier IS NOT NULL))
);
CREATE INDEX booker_mobile_operations_expiry ON booker_mobile_operations(expires_at);
ALTER TABLE booker_challenges DROP CONSTRAINT booker_challenges_purpose_check;
ALTER TABLE booker_challenges ADD CONSTRAINT booker_challenges_purpose_check
  CHECK(purpose IN ('booking','login','account-email','account-sms'));
ALTER TABLE booker_challenges ADD COLUMN operation_id UUID REFERENCES booker_mobile_operations(id) ON DELETE CASCADE;
ALTER TABLE booker_challenges ADD CONSTRAINT booker_challenge_operation_check
  CHECK ((purpose IN ('account-email','account-sms')) = (operation_id IS NOT NULL));
