import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';
import { createLocalGuideDraft, getLocalGuideEntry } from '../../src/lib/local-guide/repository.ts';
import { moderateGuideContribution } from '../../src/lib/planner/repository.ts';

const { Pool } = pg;
const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
const scoped = (base: string, schema: string) => {
  const url = new URL(base);
  url.searchParams.set('options', `-c search_path=${schema},public`);
  return url.toString();
};

test('promoted candidate drafts retain reviewed source URLs', async () => {
  assert.ok(databaseUrl, 'Set TEST_DATABASE_URL or DATABASE_URL.');
  const schema = `guide_candidate_url_${process.pid}_${crypto.randomBytes(5).toString('hex')}`;
  const control = new Pool({ connectionString: databaseUrl, max: 1 });
  const database = new Pool({ connectionString: scoped(databaseUrl, schema), max: 3 });
  try {
    await control.query(`CREATE SCHEMA ${quote(schema)}`);
    const directory = new URL('../../db/', import.meta.url);
    for (const file of (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort()) {
      await database.query(await readFile(new URL(file, directory), 'utf8'));
    }
    const admin = await database.query(`INSERT INTO admin_users(email,display_name,password_hash)
      VALUES('candidate-url@example.invalid','Candidate URL Admin','unused') RETURNING id::text`);
    const actor = { type: 'administrator' as const, adminUserId: admin.rows[0].id };
    const plan = await database.query(`INSERT INTO holiday_plans(plan_type,title,created_by_admin_user_id,updated_by_admin_user_id)
      VALUES('example','Candidate URL plan',$1,$1) RETURNING id,public_id::text`, [actor.adminUserId]);
    const participant = await database.query(`INSERT INTO plan_participants(holiday_plan_id,role,participant_type,admin_user_id,display_name)
      VALUES($1,'owner','administrator',$2,'Candidate author') RETURNING id`, [plan.rows[0].id, actor.adminUserId]);
    const candidate = await database.query(`INSERT INTO guide_contribution_candidates
      (holiday_plan_id,submitted_by_participant_id,offered_title,offered_description,offered_source_url,
       consent_version,consent_statement,attribution_permitted)
      VALUES($1,$2,'Candidate café','A useful café.','https://candidate.example/cafe',
       'test-v1','Retain this activity for Local Guide review.',FALSE) RETURNING public_id::text`,
    [plan.rows[0].id, participant.rows[0].id]);

    await moderateGuideContribution({
      candidateId: candidate.rows[0].public_id, decision: 'accept', reviewedTitle: 'Candidate café',
      reviewedDescription: 'A useful café.', reviewedSourceUrl: 'https://reviewed.example/cafe',
      resultType: 'new_entry_draft', resultGuideSlug: 'candidate-cafe', reviewedCategoryId: 'eating-out', actor,
    }, database);
    const promoted = await database.query(`SELECT c.reviewed_source_url,r.external_link,e.public_id::text
      FROM guide_contribution_candidates c
      JOIN local_guide_revisions r ON r.id=c.result_local_guide_revision_id
      JOIN local_guide_entries e ON e.id=c.result_local_guide_entry_id
      WHERE c.public_id=$1::uuid`, [candidate.rows[0].public_id]);
    assert.equal(promoted.rows[0].reviewed_source_url, 'https://reviewed.example/cafe');
    assert.equal(promoted.rows[0].external_link, 'https://reviewed.example/cafe');

    const existing = await createLocalGuideDraft({
      slug: 'existing-place',
      content: { title: 'Existing place', categoryId: 'activities', externalLink: 'https://existing.example/place' },
      actor: { ...actor, source: 'integration_test' },
    }, database);
    const updateCandidate = await database.query(`INSERT INTO guide_contribution_candidates
      (holiday_plan_id,submitted_by_participant_id,offered_title,offered_description,
       consent_version,consent_statement,attribution_permitted)
      VALUES($1,$2,'Existing place','Updated description.','test-v1',
       'Retain this activity for Local Guide review.',FALSE) RETURNING public_id::text`,
    [plan.rows[0].id, participant.rows[0].id]);
    await moderateGuideContribution({
      candidateId: updateCandidate.rows[0].public_id, decision: 'accept', reviewedTitle: 'Existing place',
      reviewedDescription: 'Updated description.', reviewedSourceUrl: null,
      resultType: 'suggested_update', resultGuideSlug: 'existing-place', actor,
    }, database);
    assert.equal((await getLocalGuideEntry(existing.id, database))?.workingRevision?.externalLink, 'https://existing.example/place');
  } finally {
    await database.end();
    await control.query(`DROP SCHEMA IF EXISTS ${quote(schema)} CASCADE`);
    await control.end();
  }
});
