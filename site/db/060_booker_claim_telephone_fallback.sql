-- Older bookings can have a valid display telephone without an E.164 value.
WITH cleaned AS (
  SELECT id, regexp_replace(trim(COALESCE(guest_telephone,'')), '[[:space:]().-]', '', 'g') AS telephone
  FROM provisional_bookings
  WHERE booker_account_id IS NULL AND booker_claim_identifier IS NULL
), normalised AS (
  SELECT id, CASE WHEN telephone LIKE '00%' THEN '+' || substr(telephone,3)
                 WHEN telephone LIKE '0%' THEN '+44' || substr(telephone,2)
                 ELSE telephone END AS identifier
  FROM cleaned
)
UPDATE provisional_bookings pb SET booker_claim_channel='sms', booker_claim_identifier=n.identifier
FROM normalised n WHERE pb.id=n.id AND n.identifier ~ '^\+[1-9][0-9]{7,14}$';
