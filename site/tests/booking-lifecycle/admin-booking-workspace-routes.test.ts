import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const bookingPageUrl = new URL('../../src/pages/admin/bookings/[reference]/index.astro', import.meta.url);
const workspaceRouteUrl = new URL('../../src/pages/admin/bookings/[reference]/[workspace]/index.astro', import.meta.url);
const accessRouteUrl = new URL('../../src/pages/admin/bookings/[reference]/access/index.astro', import.meta.url);

const workspaces = ['reservation', 'messages', 'planner', 'cancel', 'delete', 'history'] as const;

test('booking workspace routes are allow-listed and preserve the requested workspace', async () => {
  const route = await readFile(workspaceRouteUrl, 'utf8');

  for (const workspace of workspaces) assert.match(route, new RegExp(`['"]${workspace}['"]`));
  assert.match(route, /return new Response\('Booking workspace not found\.', \{ status: 404 \}\)/);
  assert.match(route, /target\.searchParams\.set\('workspace', workspace\)/);
  assert.match(route, /Astro\.rewrite\(target\)/);
});

test('each booking workspace owns one isolated, directly visible content region', async () => {
  const page = await readFile(bookingPageUrl, 'utf8');

  for (const workspace of workspaces) {
    assert.match(page, new RegExp(`workspace===['"]${workspace}['"]`));
    assert.match(page, new RegExp(`/\\$\\{booking\\.reference\\}/${workspace}/`));
  }

  assert.doesNotMatch(page, /workspace===['"](?:messages|planner|history)['"][^\n]*<details/);
  assert.match(page, /workspace==='cancel'[\s\S]*value="cancel-booking"/);
  assert.match(page, /workspace==='delete'[\s\S]*value=\{markedForDeletion\?'restore-from-deletion':'mark-for-deletion'\}/);
  assert.match(page, /workspace==='history'[\s\S]*Offer history[\s\S]*Notification audit[\s\S]*Payment history/);
  const historyStart = page.indexOf("workspace==='history'");
  const cancelStart = page.indexOf("workspace==='cancel'", historyStart);
  const historyRegion = page.slice(historyStart, cancelStart);
  assert.doesNotMatch(historyRegion, /value="(?:cancel|delete)-booking"/);
  assert.match(page, /\/planner\/\?planner=example-copied/);
  assert.match(page, /\/planner\/\?planner=created/);
  assert.match(page, /\/messages\/\?message=sent/);
  assert.match(page, /\/reservation\/\?published=1/);
  assert.match(page, /workspace==='reservation'[\s\S]*notice && <div class="pricing-message" role="status">/);
});

test('workspace pages return to booking management and lifecycle actions are visually separated', async () => {
  const [page, access] = await Promise.all([
    readFile(bookingPageUrl, 'utf8'),
    readFile(accessRouteUrl, 'utf8'),
  ]);

  assert.match(page, /booking-workspace-group--lifecycle/);
  assert.match(page, /booking-workspace-action--caution/);
  assert.match(page, /booking-workspace-action--danger/);
  assert.match(page, /workspace \? <a[^>]+href=\{`\/admin\/bookings\/\$\{booking\.reference\}\/`\}>Back to booking<\/a>/);
  assert.match(access, /href=\{`\/admin\/bookings\/\$\{reference\}\/`\}>Back to booking<\/a>/);
  assert.doesNotMatch(access, />Back to bookings<\/a>/);
});
