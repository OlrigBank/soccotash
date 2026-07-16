import crypto from 'node:crypto';
import pg from 'pg';
const { Client } = pg;
const email = (process.argv[2] || process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const displayName = (process.argv[3] || process.env.ADMIN_DISPLAY_NAME || '').trim();
const password = process.env.ADMIN_PASSWORD || '';
if (!email || !displayName || !password) {
  console.error('Usage: ADMIN_PASSWORD="a-long-password" npm run admin:create -- admin@example.com "Display Name"');
  process.exit(1);
}
if (password.length < 12) throw new Error('Password must contain at least 12 characters.');
const salt = crypto.randomBytes(16);
const key = await new Promise((resolve, reject) => crypto.scrypt(password, salt, 64, { N:16384, r:8, p:1, maxmem:64*1024*1024 }, (e,k) => e ? reject(e) : resolve(k)));
const passwordHash = `scrypt$16384$8$1$${salt.toString('base64url')}$${key.toString('base64url')}`;
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required.');
const ssl = process.env.DATABASE_SSL === 'true' || (process.env.NODE_ENV === 'production' && process.env.DATABASE_SSL !== 'false') ? { rejectUnauthorized:false } : undefined;
const client = new Client({ connectionString, ssl });
await client.connect();
try {
  await client.query(`INSERT INTO admin_users (email, display_name, password_hash) VALUES ($1,$2,$3)
    ON CONFLICT (email) DO UPDATE SET display_name=EXCLUDED.display_name,password_hash=EXCLUDED.password_hash,active=TRUE,updated_at=NOW()`, [email,displayName,passwordHash]);
  console.log(`Administrator ${email} has been created or updated.`);
} finally { await client.end(); }
