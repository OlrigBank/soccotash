import pg from 'pg';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined });
await client.connect();
try {
  await client.query('BEGIN');
  for (const table of ['booker_mobile_operations', 'booker_challenges', 'booker_verification_grants', 'booker_sessions']) {
    await client.query(`DELETE FROM ${table} WHERE expires_at < NOW() - INTERVAL '24 hours'`);
  }
  await client.query("DELETE FROM booker_verification_requests WHERE created_at < NOW() - INTERVAL '24 hours'");
  await client.query("DELETE FROM booker_submissions WHERE created_at < NOW() - INTERVAL '30 days'");
  await client.query('COMMIT');
  console.log('Expired booker authentication records removed. Accounts and bookings retained.');
} catch (error) { await client.query('ROLLBACK'); throw error; } finally { await client.end(); }
