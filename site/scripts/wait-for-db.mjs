import pg from 'pg';

const { Client } = pg;
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required.');

const attempts = Number(process.env.DATABASE_WAIT_ATTEMPTS || 30);
const delayMs = Number(process.env.DATABASE_WAIT_DELAY_MS || 2000);
const ssl = process.env.DATABASE_SSL === 'true' || (process.env.NODE_ENV === 'production' && process.env.DATABASE_SSL !== 'false')
  ? { rejectUnauthorized: false }
  : undefined;

for (let attempt = 1; attempt <= attempts; attempt += 1) {
  const client = new Client({ connectionString, ssl });
  try {
    await client.connect();
    await client.query('SELECT 1');
    await client.end();
    console.log('PostgreSQL is ready.');
    process.exit(0);
  } catch (error) {
    await client.end().catch(() => undefined);
    if (attempt === attempts) throw error;
    console.log(`Waiting for PostgreSQL (${attempt}/${attempts})…`);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}
