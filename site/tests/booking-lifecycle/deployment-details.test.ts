import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const adminDashboardSource = readFileSync(
  new URL('../../src/pages/admin/index.astro', import.meta.url),
  'utf8',
);

test('the admin dashboard identifies the PR 46 acceptance deployment', () => {
  assert.match(
    adminDashboardSource,
    /const featureBranch = 'agent\/cancellation-lifecycle-acc-test';/,
  );
  assert.match(adminDashboardSource, /const featureIteration = 3;/);
});
