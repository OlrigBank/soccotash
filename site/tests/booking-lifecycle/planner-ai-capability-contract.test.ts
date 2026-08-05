import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../../db/029_planner_ai_capabilities.sql', import.meta.url);
const accessUrl = new URL('../../src/lib/planner/ai-capability-access.ts', import.meta.url);
const repositoryUrl = new URL('../../src/lib/planner/repository.ts', import.meta.url);

test('AI capabilities are narrow, short-lived and store only credential hashes', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  assert.match(migration, /token_hash TEXT/);
  assert.doesNotMatch(migration, /token(?!_hash)\s+TEXT/);
  assert.match(migration, /protocol_version = '1\.0'/);
  assert.match(migration, /scopes = ARRAY\['plan:read', 'proposal:submit'\]/);
  assert.match(migration, /expires_at <= created_at \+ INTERVAL '24 hours'/);
  assert.match(migration, /REFERENCES holiday_plans\(id\) ON DELETE CASCADE/);
  assert.match(migration, /FOREIGN KEY \(created_by_participant_id, holiday_plan_id\)/);
});

test('capability resolution fails closed around token and booking lifetimes', async () => {
  const access = await readFile(accessUrl, 'utf8');
  assert.match(access, /randomBytes\(32\)\.toString\('base64url'\)/);
  assert.match(access, /createHash\('sha256'\)/);
  assert.match(access, /revoked_at IS NULL AND c\.expires_at > NOW\(\)/);
  assert.match(access, /bookingAccessState/);
  assert.match(access, /hp\.plan_type = 'booking_linked'/);
});

test('only owners and active editors can manage audited capabilities', async () => {
  const repository = await readFile(repositoryUrl, 'utf8');
  assert.match(repository, /role='owner' AND revoked_at IS NULL/);
  assert.match(repository, /role='editor' AND revoked_at IS NULL/);
  assert.match(repository, /ai_capability_created/);
  assert.match(repository, /ai_capability_revoked/);
  assert.match(repository, /token_hash=NULL/);
});
