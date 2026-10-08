import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { welcomeSchema, welcomeContactSchema, safeWelcomeLink, topicSummary, welcomeQrUrl, assertWelcomeHistory } from '../../src/lib/welcome.ts';
import { PAGES_CMS_BRANCH, PAGES_CMS_BRANCH_URL, PAGES_CMS_SECTIONS } from '../../src/lib/admin/pages-cms.ts';
import { sitemapPaths } from '../../src/lib/sitemap.ts';

const source = parse(readFileSync(new URL('../../src/data/welcome.yml', import.meta.url), 'utf8'));
const original = welcomeSchema.parse(source);
const fixture = () => structuredClone(original);

test('safe links reject executable, ambiguous and credential-bearing destinations', () => {
  for (const link of ['/guest-information/#departure', '/local-guide/', 'https://example.org/guide?q=stay#arrival']) assert.equal(safeWelcomeLink(link), true, link);
  for (const link of ['javascript:alert(1)', 'data:text/html,hello', '//example.org/', '/\\evil.test', 'https://user:pass@example.org', 'http://example.org', ' https://example.org', '/path\n', 'https:///example.org', 'https://']) {
    assert.equal(safeWelcomeLink(link), false, link);
  }
});

test('welcome schema rejects missing copy, malformed IDs, collisions and unsafe links', () => {
  for (const key of ['title', 'description', 'introduction', 'supportingText', 'logoAlt', 'closingMessage']) {
    assert.equal(welcomeSchema.safeParse({ ...source, [key]: ' ' }).success, false, key);
  }
  for (const id of ['UPPER', 'with spaces', '-start', 'double--hyphen', 'main-content']) {
    const content = fixture(); content.topics[0].id = id;
    assert.equal(welcomeSchema.safeParse(content).success, false, id);
  }
  const duplicate = fixture(); duplicate.topics[1].id = duplicate.topics[0].id;
  assert.equal(welcomeSchema.safeParse(duplicate).success, false);
  const alias = fixture(); alias.topics[0].aliases.push(alias.topics[1].id);
  assert.equal(welcomeSchema.safeParse(alias).success, false);
  const unsafe = fixture(); unsafe.topics[0].detailsUrl = 'javascript:alert(1)';
  assert.equal(welcomeSchema.safeParse(unsafe).success, false);
  for (const logo of ['https://example.org/logo.jpg', '/media/images/../secret.jpg', '/private/logo.jpg']) assert.equal(welcomeSchema.safeParse({ ...source, logo }).success, false);
});

test('editing titles, links, summaries and ordering leaves canonical QR payloads unchanged', () => {
  const content = fixture();
  const before = new Map(content.topics.map(topic => [topic.id, welcomeQrUrl(topic.id)]));
  content.topics.reverse();
  for (const topic of content.topics) {
    topic.title += ' updated'; topic.summary += ' More useful guidance.';
    topic.detailsUrl = 'https://example.org/new-guidance';
    assert.equal(welcomeQrUrl(topic.id), before.get(topic.id));
    assert.match(welcomeQrUrl(topic.id), /^https:\/\/olrig-bank\.com\/welcome\/#[a-z0-9-]+$/);
  }
  assert.doesNotThrow(() => assertWelcomeHistory(original, content));
  assert.throws(() => welcomeQrUrl('../unsafe'), /Invalid/);
});

test('retirement preserves printed destinations and reserves retired IDs', () => {
  const retired = fixture(); retired.topics[0].status = 'retired';
  assert.doesNotThrow(() => assertWelcomeHistory(original, retired));
  const removed = fixture(); removed.topics.shift();
  assert.throws(() => assertWelcomeHistory(original, removed), /status retired/);
  assert.throws(() => assertWelcomeHistory(retired, original), /cannot be reused/);
  const renamed = fixture(); renamed.topics[0].aliases = [renamed.topics[0].id]; renamed.topics[0].id = 'arrival';
  assert.doesNotThrow(() => assertWelcomeHistory(original, renamed));
  const lostAlias = structuredClone(renamed); lostAlias.topics[0].aliases = [];
  assert.throws(() => assertWelcomeHistory(renamed, lostAlias), /Keep alias/);
  const added = fixture(); added.topics.push({ ...added.topics[0], id: 'new-topic', aliases: [] });
  assert.doesNotThrow(() => assertWelcomeHistory(original, welcomeSchema.parse(added)));
  assert.equal(welcomeSchema.safeParse({ ...original, topics: [] }).success, true);
});

test('contact settings supply help copy, while ordinary topics stay independent', () => {
  const contact = welcomeContactSchema.parse({ phone: '+44 1234 567890', email: 'fixture@example.invalid' });
  const help = original.topics.find(topic => topic.includeContactDetails)!;
  assert.match(topicSummary(help, contact), /\+44 1234 567890.*fixture@example.invalid/);
  assert.equal(topicSummary(original.topics[0], contact), original.topics[0].summary);
  assert.equal(welcomeContactSchema.safeParse({ phone: '<script>', email: 'invalid' }).success, false);
  assert.doesNotMatch(help.summary, /@|\+44/);
});

test('CMS destinations target development and the welcome singleton matches configuration', () => {
  assert.equal(PAGES_CMS_BRANCH, 'development');
  assert.equal(PAGES_CMS_BRANCH_URL, 'https://app.pagescms.org/olrigbank/soccotash/development');
  for (const section of PAGES_CMS_SECTIONS) assert.ok(section.href.startsWith(`${PAGES_CMS_BRANCH_URL}/`));
  const cms = parse(readFileSync(new URL('../../../.pages.yml', import.meta.url), 'utf8'));
  const editor = cms.content.find((entry: { name: string }) => entry.name === 'welcome');
  assert.equal(editor.type, 'file'); assert.equal(editor.path, 'site/src/data/welcome.yml');
  assert.equal(PAGES_CMS_SECTIONS[0].href, `${PAGES_CMS_BRANCH_URL}/file/${editor.name}`);
  assert.deepEqual(editor.fields.map((field: { name: string }) => field.name).sort(), Object.keys(original).sort());
});

test('sitemap indexes the welcome page once and leaves the print route out', () => {
  const paths = sitemapPaths({ pageIds: ['home'], listingSlugs: [], localGuideCategoryIds: [], localGuideEntrySlugs: [], holidayPlanSlugs: [] });
  assert.equal(paths.filter(path => path === '/welcome/').length, 1);
  assert.ok(!paths.includes('/welcome/print/'));
});
