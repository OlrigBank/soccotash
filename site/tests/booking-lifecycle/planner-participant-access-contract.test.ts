import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../', import.meta.url);

test('planner participant invitations and role boundaries remain private and server enforced', async () => {
  const [migration, access, repository, ownerPage, participantPage, participantApi] = await Promise.all([
    readFile(new URL('db/025_planner_participant_access.sql', root), 'utf8'),
    readFile(new URL('src/lib/planner/participant-access.ts', root), 'utf8'),
    readFile(new URL('src/lib/planner/repository.ts', root), 'utf8'),
    readFile(new URL('src/pages/booking/manage/[token]/planner/index.astro', root), 'utf8'),
    readFile(new URL('src/pages/planner/invite/[token].astro', root), 'utf8'),
    readFile(new URL('src/pages/api/planner/participant/[token].ts', root), 'utf8'),
  ]);
  assert.match(migration, /access_token_hash/, 'only a participant credential hash may be persisted');
  assert.match(migration, /revoked_at/, 'participant access must be revocable');
  assert.match(access, /createHash\('sha256'\)/, 'participant tokens must be hashed before lookup');
  assert.doesNotMatch(repository, /INSERT INTO plan_participants[\s\S]{0,500}access_token[^_]/, 'the raw token must not be inserted');
  assert.match(repository, /role <> 'owner'/, 'the sole owner cannot be changed or revoked through invitation actions');
  assert.match(ownerPage, /invite-participant-form/, 'the focused Booker view must expose invitations in its collaboration section');
  assert.match(ownerPage, /It will not be shown again/, 'one-time invitation links need an explicit handling warning');
  assert.match(repository, /invitePlanParticipant/, 'the invitation service must remain server enforced');
  assert.match(participantPage, /private, no-store/, 'participant workspaces must not be cached');
  assert.match(participantPage, /noindex,nofollow,noarchive/, 'participant workspaces must not be indexed');
  assert.match(participantApi, /access\.role==='viewer'/, 'viewer mutation denial must be server-side');
  assert.match(participantApi, /input\.action!==\'addItem\'/, 'contributors must be restricted to proposals server-side');
  assert.match(participantApi, /status:'proposed'/, 'contributor submissions must remain proposals');
  assert.match(repository, /actor\.planId !== planId/, 'participant credentials must be bound to one plan');
  assert.doesNotMatch(participantApi, /console\.error\([^\n]*token/, 'invitation credentials must not enter logs');
});
