import pg from 'pg';

const { Pool } = pg;
let pool: pg.Pool | undefined;

function databaseSsl(): { rejectUnauthorized: false } | undefined {
  if (process.env.DATABASE_SSL === 'false') return undefined;
  if (process.env.DATABASE_SSL === 'true' || process.env.NODE_ENV === 'production') {
    return { rejectUnauthorized: false };
  }
  return undefined;
}

export function getPool(): pg.Pool {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured.');
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: databaseSsl(),
      max: 5,
    });
  }
  return pool;
}
