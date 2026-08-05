import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { AI_CAPABILITY_RATE_LIMITS } from '../../src/lib/planner/ai-capability-access.ts';

const migrationUrl=new URL('../../db/032_planner_ai_security_hardening.sql',import.meta.url);
const accessUrl=new URL('../../src/lib/planner/ai-capability-access.ts',import.meta.url);
const proposalUrl=new URL('../../src/pages/planner/ai/[token]/proposals.ts',import.meta.url);

test('uses bounded read and proposal budgets with retry guidance',async()=>{
  assert.deepEqual(AI_CAPABILITY_RATE_LIMITS,{read:{requests:120,windowMinutes:15},proposal:{requests:10,windowMinutes:60}});
  const proposal=await readFile(proposalUrl,'utf8');assert.match(proposal,/status:429/);assert.match(proposal,/Retry-After/);
});

test('records token-free capability outcomes and serialises rate decisions',async()=>{
  const [migration,access]=await Promise.all([migrationUrl,accessUrl].map(url=>readFile(url,'utf8')));
  assert.match(migration,/plan_ai_access_events/);assert.doesNotMatch(migration,/token_hash/);
  assert.match(access,/FOR UPDATE OF c/);assert.match(access,/rate_limited/);assert.match(access,/booking_inactive/);
  assert.match(access,/INTERVAL '90 days'/);
  assert.doesNotMatch(access,/console\.(log|warn|error)/);
});
