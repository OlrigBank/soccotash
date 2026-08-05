import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../', import.meta.url);

test('Local Guide candidate creation requires specific explicit guest consent', async () => {
  const [migration, repository, bookerPage, participantPage, bookerApi, participantApi] = await Promise.all([
    readFile(new URL('db/026_guide_contribution_consent.sql', root), 'utf8'),
    readFile(new URL('src/lib/planner/repository.ts', root), 'utf8'),
    readFile(new URL('src/pages/booking/manage/[token]/planner/index.astro', root), 'utf8'),
    readFile(new URL('src/pages/planner/invite/[token].astro', root), 'utf8'),
    readFile(new URL('src/pages/api/booking/planner/[token].ts', root), 'utf8'),
    readFile(new URL('src/pages/api/planner/participant/[token].ts', root), 'utf8'),
  ]);
  assert.match(migration, /consent_version/, 'the exact consent contract must be versioned');
  assert.match(migration, /consent_statement/, 'the consent wording itself must be retained');
  assert.match(migration, /consented_at/, 'consent time must be retained');
  assert.match(migration, /attribution_permitted BOOLEAN NOT NULL DEFAULT FALSE/, 'attribution must default off');
  assert.match(migration, /status IN \('pending', 'withdrawn', 'under_review', 'accepted', 'rejected'\)/, 'candidate state must support later moderation');
  assert.doesNotMatch(migration, /access_token|guest_email|reservation_note/, 'candidate persistence must exclude credentials and unrelated private data');
  assert.match(repository, /input\.consent !== true/, 'the server must require explicit consent');
  assert.match(repository, /i\.local_guide_slug IS NULL/, 'existing Local Guide references must not be re-offered');
  assert.match(repository, /r\.changes->>'itemId' = i\.public_id::text/, 'eligibility must bind to the immutable item creation revision');
  assert.match(repository, /submitted_by_participant_id = \$3/, 'only the submitter may withdraw a candidate');
  for (const page of [bookerPage, participantPage]) {
    assert.match(page, /name="consent" type="checkbox" required/, 'consent must be an unchecked required control');
    assert.match(page, /Nothing is published until Olrig Bank reviews it/, 'the UI must explain the moderation boundary');
  }
  assert.match(bookerApi, /input\.consent===true/, 'Booker consent must be passed as an explicit boolean');
  assert.match(participantApi, /input\.consent===true/, 'participant consent must be passed as an explicit boolean');
});
