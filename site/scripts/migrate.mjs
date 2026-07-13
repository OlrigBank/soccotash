import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
const { Client } = pg;
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined });
await client.connect();
try {
  const sql = await fs.readFile(path.join(process.cwd(), 'db/001_booking.sql'), 'utf8');
  await client.query(sql);
  console.log('Booking database migration complete.');
} finally { await client.end(); }
