import { spawn } from 'node:child_process';
import { createLocalFixtureDatabase } from './local-fixture-database.mjs';

// The helper accepts local PostgreSQL only. Every test creates and removes its
// own schema; the application database's tables and guest records are untouched.
const fixture = await createLocalFixtureDatabase('airbnb_date_integration');
try {
  const child = spawn(process.execPath, ['--test', '--test-concurrency=1',
    'site/tests/integration/airbnb-review-import.test.ts',
    'site/tests/integration/airbnb-admin-query.test.ts',
    'site/tests/integration/airbnb-review-reconciliation.test.ts',
  ], { stdio: 'inherit', env: { ...process.env, TEST_DATABASE_URL: process.env.DATABASE_URL } });
  process.exitCode = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', code => resolve(code ?? 1)); });
} finally { await fixture.close(); }
