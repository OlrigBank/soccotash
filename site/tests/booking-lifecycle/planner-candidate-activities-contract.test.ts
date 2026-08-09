import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../../db/039_planner_candidate_activities.sql', import.meta.url);
const guideUrlMigrationUrl = new URL('../../db/040_planner_guide_candidate_source_urls.sql', import.meta.url);
const repositoryUrl = new URL('../../src/lib/planner/repository.ts', import.meta.url);
const pageUrl = new URL('../../src/pages/booking/manage/[token]/planner/index.astro', import.meta.url);
const apiUrl = new URL('../../src/pages/api/booking/planner/[token].ts', import.meta.url);

test('candidate activities have durable ordering, safe sources and dated booking-plan backfill', async () => {
  const [migration, guideUrlMigration, repository] = await Promise.all([
    readFile(migrationUrl, 'utf8'), readFile(guideUrlMigrationUrl, 'utf8'), readFile(repositoryUrl, 'utf8'),
  ]);
  assert.match(migration, /CREATE TABLE plan_candidate_activities/);
  assert.match(migration, /UNIQUE \(holiday_plan_id, position\)/);
  assert.match(migration, /source_url ~ '\^https\?:\/\/'/);
  assert.match(migration, /REFERENCES local_guide_entries\(id\) ON DELETE RESTRICT/);
  assert.match(guideUrlMigration, /DROP CONSTRAINT plan_candidate_activities_check/);
  assert.match(guideUrlMigration, /UPDATE plan_candidate_activities[\s\S]*revision\.external_link/);
  assert.match(guideUrlMigration, /UPDATE plan_items[\s\S]*revision\.external_link/);
  assert.match(migration, /NOT EXISTS \(SELECT 1 FROM plan_days/);
  assert.match(repository, /addPlanCandidateActivity/);
  assert.match(repository, /addPlanGuideCandidates/);
  assert.match(repository, /sourceUrl = validateSourceUrl\(published\.rows\[0\]\.external_link\)/);
  assert.match(repository, /validateSourceUrl\(guide\.external_link\)/);
  assert.match(repository, /guide_category_candidates_added/);
  assert.match(repository, /movePlanCandidateActivity/);
  assert.match(repository, /removePlanCandidateActivity/);
  assert.match(repository, /schedulePlanCandidateActivity/);
  assert.match(repository, /returnPlanItemToCandidates/);
  assert.match(repository, /placePlanItem/);
  assert.match(repository, /orderDayItemsBySchedule/);
  assert.match(repository, /ORDER BY start_time IS NULL, start_time NULLS LAST, position, id/);
  assert.match(repository, /expectedRevision/);
});

test('guest planner exposes the focused daily planner, candidates and guide in planning order', async () => {
  const [page, api, treeBranch] = await Promise.all([readFile(pageUrl, 'utf8'), readFile(apiUrl, 'utf8'),readFile(new URL('../../src/components/LocalGuideTreeBranch.astro',import.meta.url),'utf8')]);
  const dailyPlanner = page.indexOf('<strong>Your daily planner</strong>');
  const candidates = page.indexOf('<strong>Candidate activities</strong>');
  const localGuide = page.indexOf('<strong>Local Guide</strong>');
  assert.ok(dailyPlanner >= 0 && dailyPlanner < candidates && candidates < localGuide);
  assert.match(page, /aria-label="Planner view"[\s\S]*>List<\/a>[\s\S]*>Schedule<\/a>/);
  assert.match(page, /candidate\.sourceUrl[\s\S]*candidate-activity-title[\s\S]*candidate\.title/);
  assert.match(page, />LG<\/a>/);
  assert.match(page, />WS ↗<\/a>/);
  assert.match(page, /data-time-grid/);
  assert.match(page, /Unscheduled for this day/);
  assert.match(page, /data-resize-item/);
  assert.match(page, /data-schedule-drag-handle/);
  assert.match(page, /placeItemAt/);
  assert.match(page, /setPointerCapture/);
  assert.match(page, /itemId:item\.id,startTime,endTime/);
  assert.match(page, /data-schedule-day-drag-handle/);
  assert.match(page, /data-move-schedule-day/);
  assert.match(page, /card\.style\.transform=`translate/);
  assert.match(page, /else if\(overGrid\)/);
  assert.match(page, /targetDayId:tab\.dataset\.dayDrop,position:'end'/);
  assert.match(page, /Math\.round\(raw\/30\)\*30/);
  assert.match(page, /updateItemTimes\(item,null,null\)/);
  assert.match(page, /hidden=\{plannerView==='schedule'\}/);
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
