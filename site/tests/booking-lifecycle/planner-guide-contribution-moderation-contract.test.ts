import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root=new URL('../../',import.meta.url);

test('administrator moderation creates audited non-public contribution results',async()=>{
  const [migration,repository,page,api,middleware]=await Promise.all([
    readFile(new URL('db/027_guide_contribution_moderation.sql',root),'utf8'),
    readFile(new URL('src/lib/planner/repository.ts',root),'utf8'),
    readFile(new URL('src/pages/admin/planner/contributions/index.astro',root),'utf8'),
    readFile(new URL('src/pages/api/admin/planner/contributions.ts',root),'utf8'),
    readFile(new URL('src/middleware.ts',root),'utf8'),
  ]);
  assert.match(migration,/new_entry_draft.*suggested_update/,'accepted results need an explicit destination type');
  assert.match(migration,/reviewed_by_admin_user_id/,'moderation must retain administrator attribution');
  assert.match(migration,/reviewed_at/,'moderation must retain its decision time');
  assert.match(migration,/status = 'accepted'[\s\S]*result_guide_slug IS NOT NULL/,'accepted results must link to a guide slug');
  assert.doesNotMatch(migration,/publication_status|published_at/,'moderation must not publish guest content');
  assert.match(repository,/c\.status = 'pending'[\s\S]*FOR UPDATE OF c, hp/,'a candidate decision must lock one pending candidate');
  assert.match(repository,/guide_contribution_accepted.*guide_contribution_rejected/,'both terminal decisions need plan audit actions');
  assert.match(page,/Review only the content each guest explicitly offered/,'the queue must state its privacy boundary');
  assert.match(page,/Accept as non-public draft/,'acceptance must clearly remain non-public');
  assert.match(page,/Rejection reason[\s\S]*required/,'rejections need a reason');
  assert.match(api,/requirePlannerGuideSlug/,'suggested updates must reference existing database guide content');
  assert.match(api,/That Local Guide slug already exists/,'new drafts must not overwrite existing guide content');
  assert.match(api,/isSameOrigin\(request\)/,'moderation mutations need same-origin protection');
  assert.match(middleware,/path\.startsWith\('\/api\/admin\/'\)/,'the moderation API must remain administrator-authenticated');
  assert.doesNotMatch(api,/console\.error\([^\n]*(offered|reviewed|description)/,'private candidate content must not enter logs');
});
