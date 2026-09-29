import { readFile, readdir } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { randomBytes } from 'node:crypto';
import pg from 'pg';

export async function createLocalFixtureDatabase(prefix) {
  let local = {};
  try { local = parseEnv(await readFile('.env', 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const connectionString = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || local.DATABASE_URL
    || `postgresql://${encodeURIComponent(local.POSTGRES_USER || 'soccotash')}:${encodeURIComponent(local.POSTGRES_PASSWORD || '')}@127.0.0.1:${local.POSTGRES_PORT || 5433}/${local.POSTGRES_DB || 'soccotash'}`;
  if (!['localhost', '127.0.0.1'].includes(new URL(connectionString).hostname)) throw new Error('A local database is required.');
  if (!/^[a-z_]+$/.test(prefix)) throw new Error('Invalid fixture prefix.');
  const schema = `${prefix}_${randomBytes(8).toString('hex')}`;
  const control = new pg.Pool({ connectionString });
  // Extensions are database-wide. Installing them in a disposable schema makes
  // parallel fixtures unable to find their functions and drops them on cleanup.
  const bootstrap = await control.connect();
  try {
    await bootstrap.query('BEGIN');
    await bootstrap.query("SELECT pg_advisory_xact_lock(hashtext('local-fixture-extensions'))");
    await bootstrap.query('CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public');
    await bootstrap.query('CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public');
    await bootstrap.query('COMMIT');
  } catch (error) {
    await bootstrap.query('ROLLBACK');
    bootstrap.release();
    await control.end();
    throw error;
  }
  bootstrap.release();
  await control.query(`CREATE SCHEMA ${schema}`);
  const url = new URL(connectionString);
  url.searchParams.set('options', `-c search_path=${schema},public`);
  const database = new pg.Pool({ connectionString: url.toString() });
  const close = async () => {
    await database.end();
    await control.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await control.end();
  };
  try {
    const directory = new URL('../../site/db/', import.meta.url);
    for (const name of (await readdir(directory)).filter(name => name.endsWith('.sql')).sort()) {
      await database.query(await readFile(new URL(name, directory), 'utf8'));
    }
  } catch (error) { await close(); throw error; }
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_SSL = 'false';
  return { database, close };
}
