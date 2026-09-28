import type { Pool, PoolClient } from 'pg';
import { getPool } from './db.ts';
import { validBookingReference } from '../booker/context.ts';
import { getOccupancyDetails, type BookingPet } from './occupancy-details.ts';
import type { StaySelection } from './booking-panel.ts';

// Reused inside the write transaction; hiding an edit link is not authorisation.
export const editableRequestJourneySql = `pb.request_journey_revision > 0
  AND pb.status = 'offered' AND pb.deletion_requested_at IS NULL
  AND pb.customer_access_token_revoked_at IS NULL AND pb.departure >= CURRENT_DATE
  AND EXISTS (SELECT 1 FROM booking_offers bo WHERE bo.provisional_booking_id=pb.id
    AND bo.customer_status='active' AND bo.admin_user_id IS NULL
    AND bo.token_revoked_at IS NULL AND (bo.valid_until IS NULL OR bo.valid_until >= CURRENT_DATE))
  AND NOT EXISTS (SELECT 1 FROM booking_checkout_attempts ca WHERE ca.provisional_booking_id=pb.id)
  AND NOT EXISTS (SELECT 1 FROM booking_payments bp WHERE bp.provisional_booking_id=pb.id)`;

export type RequestJourney = StaySelection & {
  id: string; reference: string; revision: number; name: string; email: string;
  telephone: string; message: string; promoCode: string; petDetails: BookingPet[];
};

export async function getEditableRequestJourney(reference: string, accountId: string | null,
  database: Pool | PoolClient = getPool()): Promise<RequestJourney | null> {
  if (!accountId || !validBookingReference(reference)) return null;
  const result = await database.query(`SELECT pb.id::text,pb.public_id::text AS reference,
    pb.request_journey_revision AS revision,pb.property_id AS "propertyId",pb.arrival::text,pb.departure::text,
    pb.adults,pb.children,pb.infants,pb.pets,pb.guest_name AS name,pb.guest_email AS email,
    COALESCE(pb.guest_telephone,'') AS telephone,COALESCE(pb.guest_message,'') AS message,
    COALESCE(pb.promo_code,'') AS "promoCode"
    FROM provisional_bookings pb WHERE pb.public_id=$1::uuid AND pb.booker_account_id=$2::uuid
    AND ${editableRequestJourneySql}`, [reference, accountId]);
  if (!result.rowCount) return null;
  return { ...result.rows[0], petDetails: (await getOccupancyDetails(reference, database)).pets };
}
