import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const pageUrl = new URL('../../src/pages/planner/ai/[token]/index.astro', import.meta.url);
const planUrl = new URL('../../src/pages/planner/ai/[token]/plan.json.ts', import.meta.url);
const schemaUrl = new URL('../../src/pages/planner/ai/[token]/schema.json.ts', import.meta.url);
const instructionsUrl = new URL('../../src/lib/planner/ai-instructions.ts', import.meta.url);
const layoutUrl = new URL('../../src/layouts/BaseLayout.astro', import.meta.url);

test('collaboration views require the temporary AI capability and privacy headers', async () => {
  const [page, plan, schema] = await Promise.all([pageUrl, planUrl, schemaUrl].map(url => readFile(url, 'utf8')));
  for (const source of [page, plan, schema]) {
    assert.match(source, /resolveAiCapabilityCredential/);
    assert.match(source, /no-store/);
    assert.match(source, /no-referrer/);
    assert.match(source, /noindex/);
    assert.match(source, /status:\s*404/);
  }
  assert.match(plan, /createAiPlanRepresentationV1/);
  assert.match(schema, /ai-representation\.schema\.json/);
});

test('human collaboration is instruction-led, read-only and analytics-free', async () => {
  const [page, instructions, layout] = await Promise.all([pageUrl, instructionsUrl, layoutUrl].map(url => readFile(url, 'utf8')));
  assert.match(page, /analytics=\{false\}/);
  assert.match(layout, /analytics && <Analytics/);
  assert.doesNotMatch(page, /<form|method=['"]post|fetch\(/i);
  assert.match(page, /Proposal submission is not enabled/);
  assert.match(instructions, /Never mark an activity as booked without explicit guest confirmation/);
  assert.match(instructions, /Changing the accommodation booking, contact details or payment information/);
  assert.match(instructions, /Inviting or removing participants/);
  assert.match(instructions, /Publishing content to the Local Guide/);
  assert.match(instructions, /Changing the live plan directly/);
});
