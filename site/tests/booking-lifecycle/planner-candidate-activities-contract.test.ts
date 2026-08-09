import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../../db/039_planner_candidate_activities.sql', import.meta.url);
const repositoryUrl = new URL('../../src/lib/planner/repository.ts', import.meta.url);
const pageUrl = new URL('../../src/pages/booking/manage/[token]/planner/index.astro', import.meta.url);
const apiUrl = new URL('../../src/pages/api/booking/planner/[token].ts', import.meta.url);

test('candidate activities have durable ordering, safe sources and dated booking-plan backfill', async () => {
  const [migration, repository] = await Promise.all([
    readFile(migrationUrl, 'utf8'), readFile(repositoryUrl, 'utf8'),
  ]);
  assert.match(migration, /CREATE TABLE plan_candidate_activities/);
  assert.match(migration, /UNIQUE \(holiday_plan_id, position\)/);
  assert.match(migration, /source_url ~ '\^https\?:\/\/'/);
  assert.match(migration, /REFERENCES local_guide_entries\(id\) ON DELETE RESTRICT/);
  assert.match(migration, /NOT EXISTS \(SELECT 1 FROM plan_days/);
  assert.match(repository, /addPlanCandidateActivity/);
  assert.match(repository, /addPlanGuideCandidates/);
  assert.match(repository, /guide_category_candidates_added/);
  assert.match(repository, /movePlanCandidateActivity/);
  assert.match(repository, /removePlanCandidateActivity/);
  assert.match(repository, /schedulePlanCandidateActivity/);
  assert.match(repository, /returnPlanItemToCandidates/);
  assert.match(repository, /placePlanItem/);
  assert.match(repository, /expectedRevision/);
});

test('guest planner exposes the three focused sections and accessible alternatives to dragging', async () => {
  const [page, api, treeBranch] = await Promise.all([readFile(pageUrl, 'utf8'), readFile(apiUrl, 'utf8'),readFile(new URL('../../src/components/LocalGuideTreeBranch.astro',import.meta.url),'utf8')]);
  assert.match(page, /<strong>Local Guide<\/strong>/);
  assert.match(page, /<strong>Candidate activities<\/strong>/);
  assert.match(page, /<strong>Your plan<\/strong>/);
  assert.match(page, /<LocalGuideTree nodes=\{guideTree\} plannerMode/);
  assert.match(page, /buildLocalGuideTree/);
  assert.match(treeBranch, /target="_blank" rel="noopener noreferrer"/);
  assert.match(treeBranch, /data-local-guide-category=\{node\.id\}/);
  assert.match(treeBranch, /planner-drag-handle/);
  assert.match(treeBranch, /Drag \$\{entry\.title\} to candidates, or select to add it/);
  assert.match(treeBranch, /data-guide-category-drag/);
  assert.match(treeBranch, /data-add-guide-category/);
  assert.match(treeBranch, /Add all \{countLabel\} to candidates/);
  assert.match(page, /data-item-id=\{item\.id\}>[\s\S]*planner-drag-handle/);
  assert.match(page, /action:'placeItem'/);
  assert.match(page, /data-day-drop=\{day\.id\}/);
  assert.match(page, /action:'scheduleCandidate'[\s\S]*dayId:tab\.dataset\.dayDrop/);
  assert.match(page, /data-candidate-move="up"/);
  assert.match(page, /data-schedule-candidate/);
  assert.match(page, /data-return-item/);
  assert.match(page, /planner-action-menu/);
  assert.match(page, /data-remove-candidate/);
  assert.match(page, /data-remove-item/);
  assert.match(page, /<dialog[\s\S]*Add a candidate activity/);
  assert.doesNotMatch(page, /PlannerParticipants|PlannerSharing|PlannerAiCollaboration|PlannerGuideContribution/);
  assert.match(page, /action:'addGuideCategoryCandidates'/);
  for (const action of ['addCandidate', 'addGuideCategoryCandidates', 'moveCandidate', 'removeCandidate', 'scheduleCandidate', 'returnItemToCandidates', 'placeItem']) {
    assert.match(api, new RegExp(`case '${action}'`));
  }
});
