import pg from 'pg';
import { randomUUID, randomBytes, createHash } from 'node:crypto';

// Disposable records only: direct database setup never sends a notification or creates a hold.
export async function createReservationFixture() {
  const connectionString = process.env.DATABASE_URL;
  if (connectionString && !['localhost', '127.0.0.1'].includes(new URL(connectionString).hostname)) throw new Error('Reservation fixtures require a local database.');
  const database = new pg.Client(connectionString ? {connectionString} : {
    host:'127.0.0.1', port:5433, user:process.env.POSTGRES_USER || 'soccotash',
    password:process.env.POSTGRES_PASSWORD, database:process.env.POSTGRES_DB || 'soccotash',
  });
  await database.connect();
  const name = `E13 disposable ${randomUUID()}`;
  let accountId;
  const cleanup = async () => {
    await database.query('DELETE FROM provisional_bookings WHERE guest_name=$1', [name]);
    if (accountId) await database.query('DELETE FROM booker_accounts WHERE id=$1', [accountId]);
    await database.end();
  };
  try {
    accountId = (await database.query('INSERT INTO booker_accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    const token = randomBytes(32).toString('base64url');
    await database.query("INSERT INTO booker_sessions(token_hash,account_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '1 hour')", [createHash('sha256').update(token).digest('hex'),accountId]);
    const booking = (await database.query(`INSERT INTO provisional_bookings(property_id,arrival,departure,guests,adults,children,infants,pets,guest_name,guest_email,booker_account_id)
      VALUES('bespoke-arrangement','2099-10-19','2099-10-23',2,2,0,0,0,$1,'',$2) RETURNING id, public_id::text AS reference`, [name,accountId])).rows[0];
    const setStatus = async status => {
      await database.query('UPDATE provisional_bookings SET status=$2,deposit_pence=20000,balance_due_pence=80000,balance_due_on=$3 WHERE id=$1', [booking.id,status,'2099-09-01']);
      if (status !== 'pending') {
        await database.query('DELETE FROM booking_offers WHERE provisional_booking_id=$1', [booking.id]);
        await database.query(`INSERT INTO booking_offers(provisional_booking_id,line_items,total_pence,recipient_email,subject,customer_status,published_at,valid_until,delivery_status)
          VALUES($1,'[{"label":"Fixture stay","amountPence":100000}]',100000,'','Disposable fixture',$2,NOW(),'2099-10-01','not_requested')`, [booking.id,status === 'offered' ? 'active' : 'accepted']);
      }
    };
    return {database, accountId, name, token, booking, setStatus, cleanup};
  } catch(error) { await cleanup();throw error; }
}
