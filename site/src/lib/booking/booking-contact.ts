import { getPool } from './db.ts';

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
