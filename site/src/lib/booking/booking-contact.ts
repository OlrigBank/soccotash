import { getPool } from './db.ts';
import { normaliseWhatsAppTelephone } from './whatsapp-phone.ts';

export const INACTIVE_BOOKING_STATUSES = ['declined', 'cancelled', 'expired'] as const;
export const BOOKER_CONTACT_REQUIRED_MESSAGE = 'Please provide an email address and/or a contact telephone number so that we can provide you with an offer.';

export function logBookerContactUpdate(
  traceId: string,
  stage: string,
  reference: string,
  details: Record<string, unknown> = {},
): void {
  console.info('[booker-contact-update]', JSON.stringify({ traceId, stage, reference, ...details }));
}

export function normaliseBookerEmail(value: unknown): string {
  return String(value || '').trim().toLowerCase().slice(0, 254);
}

export function validBookerEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function validateBookerContact(input: { email?: unknown; telephone?: unknown }): {
  email: string;
  telephone: string;
  telephoneE164: string | null;
  valid: boolean;
} {
  const email = normaliseBookerEmail(input.email);
  const telephone = String(input.telephone || '').trim().slice(0, 80);
  const telephoneE164 = normaliseWhatsAppTelephone(telephone);
  return {
    email,
    telephone,
    telephoneE164,
    valid: (email !== '' && validBookerEmail(email)) || telephoneE164 !== null,
  };
}

export function bookerContactSubmissionError(contact: ReturnType<typeof validateBookerContact>): string | null {
  if (!contact.email && !contact.telephone) return BOOKER_CONTACT_REQUIRED_MESSAGE;
  if (contact.email && !validBookerEmail(contact.email)) return 'Please provide a valid email address.';
  if (contact.telephone && !contact.telephoneE164) return 'Please provide a valid contact telephone number, including the country code.';
  return contact.valid ? null : BOOKER_CONTACT_REQUIRED_MESSAGE;
}

export function resolveAdminTelephoneUpdate(value: FormDataEntryValue | null, removeRequested: boolean): string {
  return removeRequested ? '' : String(value || '').trim();
}

export function adminContactUpdateStatus(removeRequested: boolean, telephone: string | null): '1' | 'telephone_removed' {
  return removeRequested && telephone === null ? 'telephone_removed' : '1';
}

export function isActiveBookingStatus(status: string): boolean {
  return !INACTIVE_BOOKING_STATUSES.includes(status as typeof INACTIVE_BOOKING_STATUSES[number]);
}

export type BookerContactUpdateResult =
  | { status: 'updated'; email: string; telephone: string | null; telephoneE164: string | null; whatsappConsentInvalidated: boolean; activityId: string }
  | { status: 'not_found' | 'invalid_contact' | 'final_contact_required' };

export async function updateProvisionalBookingContact(input: {
  reference: string;
  email: string;
  telephone: string;
  traceId?: string;
}): Promise<BookerContactUpdateResult> {
  const trace = (stage: string, details: Record<string, unknown> = {}) => {
    if (input.traceId) logBookerContactUpdate(input.traceId, stage, input.reference, details);
  };
  trace('helper.started');
  const contact = validateBookerContact(input);
  if ((contact.email && !validBookerEmail(contact.email)) || (contact.telephone && !contact.telephoneE164)) {
    return { status: 'invalid_contact' };
  }
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    trace('helper.transaction_started');
    const selected = await client.query(
      `SELECT status, guest_email, guest_telephone, guest_telephone_e164,
              whatsapp_consent_status, whatsapp_consent_number_e164
         FROM provisional_bookings WHERE public_id = $1::uuid FOR UPDATE`,
      [input.reference],
    );
    if (!selected.rowCount) { await client.query('ROLLBACK'); return { status: 'not_found' }; }
    trace('helper.booking_locked');
    const previous = selected.rows[0];
    if (!contact.valid && isActiveBookingStatus(String(previous.status))) {
      await client.query('ROLLBACK');
      return { status: 'final_contact_required' };
    }
    const telephoneChanged = (previous.guest_telephone_e164 || null) !== contact.telephoneE164;
    const whatsappConsentInvalidated = telephoneChanged && previous.whatsapp_consent_status === 'active';
    const updated = await client.query(
      `UPDATE provisional_bookings SET
         guest_email = $2, guest_telephone = $3, guest_telephone_e164 = $4,
         whatsapp_consent_status = CASE WHEN $5 THEN 'withdrawn' ELSE whatsapp_consent_status END,
         whatsapp_consent_withdrawn_at = CASE WHEN $5 THEN NOW() ELSE whatsapp_consent_withdrawn_at END,
         whatsapp_consent_number_e164 = CASE WHEN $5 THEN NULL ELSE whatsapp_consent_number_e164 END
       WHERE public_id = $1::uuid
       RETURNING id, guest_email, guest_telephone, guest_telephone_e164`,
      [input.reference, contact.email, contact.telephone || null, contact.telephoneE164, whatsappConsentInvalidated],
    );
    trace('helper.booking_updated');
    const activity = await client.query(
      `INSERT INTO booking_activity
         (provisional_booking_id, actor, event_type, details)
       VALUES ($1, 'administrator', 'booker_contact_updated', $2::jsonb)
       RETURNING id::text`,
      [
        updated.rows[0].id,
        JSON.stringify({
          previousEmail: String(previous.guest_email || ''),
          newEmail: String(updated.rows[0].guest_email || ''),
          previousTelephone: previous.guest_telephone || null,
          newTelephone: updated.rows[0].guest_telephone || null,
          whatsappConsentInvalidated,
        }),
      ],
    );
    if (activity.rowCount !== 1 || !activity.rows[0]?.id) {
      throw new Error('The Booker contact update audit entry was not recorded.');
    }
    trace('helper.activity_inserted', { activityId: String(activity.rows[0].id) });
    await client.query('COMMIT');
    trace('helper.transaction_committed', { activityId: String(activity.rows[0].id) });
    return {
      status: 'updated', email: String(updated.rows[0].guest_email),
      telephone: updated.rows[0].guest_telephone, telephoneE164: updated.rows[0].guest_telephone_e164,
      whatsappConsentInvalidated,
      activityId: String(activity.rows[0].id),
    };
  } catch (error) {
    await client.query('ROLLBACK');
    trace('helper.transaction_rolled_back', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  } finally { client.release(); }
}

export async function updateProvisionalBookingEmail(
  reference: string,
  email: string,
): Promise<string | null> {
  const result = await getPool().query(
    `UPDATE provisional_bookings
        SET guest_email = $2
      WHERE public_id = $1::uuid
      RETURNING guest_email`,
    [reference, email],
  );
  return result.rowCount ? String(result.rows[0].guest_email) : null;
}
