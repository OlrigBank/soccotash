import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildLocalGuideBaseline } from '../../scripts/generate-local-guide-baseline.ts';
import { buildLocalGuideMigrationArtifacts } from '../../scripts/generate-local-guide-data-migration.ts';

const siteRoot = new URL('../../', import.meta.url).pathname;

test('generated Local Guide migration and reconciliation report are deterministic', async () => {
  const first = await buildLocalGuideMigrationArtifacts(siteRoot);
  const second = await buildLocalGuideMigrationArtifacts(siteRoot);
  assert.deepEqual(first, second);
  assert.equal(first.report.entryCount, 39);
  assert.equal(first.report.publishedCount, 39);
  assert.equal(first.report.recommendedCount, 7);
  assert.equal(first.report.entries.length, 39);
  assert.equal(new Set(first.report.entries.map((entry) => entry.sourceSha256)).size, 39);
  assert.equal(first.report.entries.every((entry) => /^[a-f0-9]{64}$/.test(entry.sourceSha256)), true);
  assert.equal(first.sql, await readFile(new URL('../../db/034_local_guide_content_migration.sql', import.meta.url), 'utf8'));
  assert.deepEqual(first.report, JSON.parse(await readFile(new URL('../../src/data/local-guide-migration-report.json', import.meta.url), 'utf8')));
});

test('baseline generation rejects duplicate slugs before SQL generation', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'local-guide-invalid-'));
  await mkdir(path.join(root, 'src', 'content', 'local-guide'), { recursive: true });
  await mkdir(path.join(root, 'src', 'data', 'navigation'), { recursive: true });
  await writeFile(path.join(root, 'src', 'data', 'navigation', 'main.yml'), 'localGuideCategories:\n- id: activities\n');
  const source = (title: string) => `---\ntitle: ${title}\nslug: duplicate\ncategory: activities\n---\nBody\n`;
  await writeFile(path.join(root, 'src', 'content', 'local-guide', 'one.md'), source('One'));
  await writeFile(path.join(root, 'src', 'content', 'local-guide', 'two.md'), source('Two'));
  await assert.rejects(buildLocalGuideBaseline(root), /slug duplicates/);
});

test('baseline generation rejects malformed frontmatter and unknown categories', async () => {
  const malformedRoot = await mkdtemp(path.join(os.tmpdir(), 'local-guide-malformed-'));
  await mkdir(path.join(malformedRoot, 'src', 'content', 'local-guide'), { recursive: true });
  await mkdir(path.join(malformedRoot, 'src', 'data', 'navigation'), { recursive: true });
  await writeFile(path.join(malformedRoot, 'src', 'data', 'navigation', 'main.yml'), 'localGuideCategories:\n- id: activities\n');
  await writeFile(path.join(malformedRoot, 'src', 'content', 'local-guide', 'bad.md'), 'title: no delimiters\n');
  await assert.rejects(buildLocalGuideBaseline(malformedRoot), /valid YAML frontmatter/);

  const categoryRoot = await mkdtemp(path.join(os.tmpdir(), 'local-guide-category-'));
  await mkdir(path.join(categoryRoot, 'src', 'content', 'local-guide'), { recursive: true });
  await mkdir(path.join(categoryRoot, 'src', 'data', 'navigation'), { recursive: true });
  await writeFile(path.join(categoryRoot, 'src', 'data', 'navigation', 'main.yml'), 'localGuideCategories:\n- id: activities\n');
  await writeFile(path.join(categoryRoot, 'src', 'content', 'local-guide', 'bad.md'), '---\ntitle: Bad category\ncategory: unknown\n---\n');
  await assert.rejects(buildLocalGuideBaseline(categoryRoot), /category unknown is not application-managed/);
});
