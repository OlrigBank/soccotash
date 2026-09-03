import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('private planning pages share an explicit Olrig Bank shell', async () => {
  const [layout, guest, participant, share, ai, proposal, participantPrint] = await Promise.all([
    source('src/layouts/BookerLayout.astro'),
    source('src/pages/planner/guest/[token].astro'),
    source('src/pages/planner/invite/[token].astro'),
    source('src/pages/planner/share/[token].astro'),
    source('src/pages/planner/ai/[token]/index.astro'),
    source('src/pages/planner/invite/[token]/proposals/[proposalId].astro'),
    source('src/pages/planner/invite/[token]/print/index.astro'),
  ]);

  assert.match(layout, /homeHref/);
  assert.match(layout, /areaLabel/);
  assert.match(layout, /areaTitle/);
  for (const page of [guest, participant, share, ai, proposal, participantPrint]) {
    assert.match(page, /BookerLayout/);
    assert.doesNotMatch(page, /BaseLayout/);
    assert.match(page, /noindex,nofollow,noarchive/);
  }
});

test('guest access uses customer-facing controls without changing its security boundary', async () => {
  const page = await source('src/pages/planner/guest/[token].astro');
  assert.match(page, /isSameOrigin\(Astro\.request\)/);
  assert.match(page, /resolveGuestPlanSession/);
  assert.match(page, /setInitialGuestPassword/);
  assert.match(page, /signInGuestPlan/);
  assert.match(page, /class="planner-form"/);
  assert.match(page, /class="button"/);
  assert.doesNotMatch(page, /admin-form|admin-button|admin-alert/);
});

test('participant role and restricted sharing boundaries stay visible', async () => {
  const [participant, share, ai] = await Promise.all([
    source('src/pages/planner/invite/[token].astro'),
    source('src/pages/planner/share/[token].astro'),
    source('src/pages/planner/ai/[token]/index.astro'),
  ]);

  assert.match(participant, /const roleSummary=access\.role==='editor'/);
  assert.match(participant, /access\.role==='contributor'/);
  assert.match(participant, /You can view this plan, but you cannot change it/);
  assert.match(participant, /<strong>Your access:<\/strong>/);
  assert.match(share, /Read-only shared itinerary/);
  assert.match(share, /cannot change the plan or access booking details/);
  assert.match(ai, /read and propose only/);
  assert.match(ai, /Restricted representation/);
  assert.match(ai, /Submission stores a pending proposal only/);
});

test('the private shell is removed from printed itineraries', async () => {
  const styles = await source('src/styles/global.css');
  assert.match(styles, /\.booker-header,\.booker-footer[^{]*\{ display:none !important; \}/);
  assert.match(styles, /body,\.site-shell,\.booker-shell,\.booker-shell>main/);
  assert.match(styles, /\{ width:auto; margin:0; padding:0; background:#fff; color:#111; \}/);
});
