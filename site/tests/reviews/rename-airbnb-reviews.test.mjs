import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  ReviewExtractionError,
  canonicalFilename,
  extractReviewMetadata,
  parseArguments,
  processReviewDirectory,
} from '../../scripts/rename-airbnb-reviews.mjs';

const mainHouse = 'Olrig Bank: Spacious, but cosy, with large garden';
const cottage = 'Cosy Cottage, heart of Kendal, parking, big garden';

function ocrText({
  reviewer = 'Andrew',
  stay = '24-27 August - 3 nights',
  listing = mainHouse,
} = {}) {
  return `${reviewer}’s review\n${stay}\n${listing}\nPublic review - 5\nPrivate review body`;
}

test('extracts the supplied Andrew review metadata with an explicit year', () => {
  const metadata = extractReviewMetadata(ocrText(), 2026);
  assert.deepEqual(metadata, {
    reviewer: 'Andrew',
    listingSuffix: '',
    startDate: '2026-08-24',
    endDate: '2026-08-27',
    nights: 3,
  });
  assert.equal(
    canonicalFilename(metadata),
    '2026-08-24-2026-08-27 - 3 nights - Andrew Review - Airbnb.pdf',
  );
});

test('requires a year when OCR does not contain one', () => {
  assert.throws(
    () => extractReviewMetadata(ocrText(), undefined),
    (error) => error instanceof ReviewExtractionError && error.code === 'year-required',
  );
});

test('uses a visible year without requiring --year', () => {
  const metadata = extractReviewMetadata(ocrText({ stay: '24-27 August 2026 - 3 nights' }));
  assert.equal(metadata.startDate, '2026-08-24');
  assert.equal(metadata.endDate, '2026-08-27');
});

test('assigns the next year to a yearless December-to-January stay', () => {
  const metadata = extractReviewMetadata(
    ocrText({ stay: '29 December - 2 January - 4 nights' }),
    2025,
  );
  assert.equal(metadata.startDate, '2025-12-29');
  assert.equal(metadata.endDate, '2026-01-02');
});

test('classifies Cottage reviews and accepts OCR dash variants', () => {
  const metadata = extractReviewMetadata(
    ocrText({ reviewer: 'Wei Wern', stay: '9–12 August · 3 nights', listing: cottage }),
    2026,
  );
  assert.equal(metadata.listingSuffix, ' Cottage');
  assert.equal(
    canonicalFilename(metadata),
    '2026-08-09-2026-08-12 - 3 nights - Wei Wern Review Cottage - Airbnb.pdf',
  );
});

test('sanitises unsafe filename characters while preserving Unicode names', () => {
  const metadata = extractReviewMetadata(ocrText({ reviewer: 'Zoë / 李' }), 2026);
  assert.equal(metadata.reviewer, 'Zoë 李');
});

test('rejects unsupported listings and duration mismatches', () => {
  assert.throws(
    () => extractReviewMetadata(ocrText({ listing: 'Large bedroom in Victorian house, Kendal' }), 2026),
    (error) => error.code === 'listing-unsupported',
  );
  assert.throws(
    () => extractReviewMetadata(ocrText({ stay: '21-23 March - 3 nights' }), 2025),
    (error) => error.code === 'duration-mismatch',
  );
});

test('validates CLI arguments', () => {
  assert.deepEqual(parseArguments(['--year', '2026', '--apply']).suppliedYear, 2026);
  assert.equal(parseArguments(['--year', '2026', '--apply']).apply, true);
  assert.throws(() => parseArguments(['--year', '26']), /four-digit year/u);
  assert.throws(() => parseArguments(['--unknown']), /Unknown argument/u);
});

test('dry-run proposes a rename without modifying the source', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'review-renamer-test-'));
  const source = "Andrew's Review - Airbnb.pdf";
  try {
    await writeFile(path.join(directory, source), 'fixture');
    const results = await processReviewDirectory({
      directory,
      suppliedYear: 2026,
      extractor: { extract: async () => ocrText() },
    });
    assert.equal(results[0].status, 'proposed');
    assert.equal(await readFile(path.join(directory, source), 'utf8'), 'fixture');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('apply renames safely and is idempotent', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'review-renamer-test-'));
  const source = "Andrew's Review - Airbnb.pdf";
  const target = '2026-08-24-2026-08-27 - 3 nights - Andrew Review - Airbnb.pdf';
  try {
    await writeFile(path.join(directory, source), 'fixture');
    const first = await processReviewDirectory({
      directory,
      suppliedYear: 2026,
      apply: true,
      extractor: { extract: async () => ocrText() },
    });
    assert.equal(first[0].status, 'renamed');
    assert.equal(await readFile(path.join(directory, target), 'utf8'), 'fixture');
    const second = await processReviewDirectory({
      directory,
      suppliedYear: 2026,
      apply: true,
      extractor: { extract: async () => ocrText() },
    });
    assert.equal(second[0].status, 'skipped');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('never overwrites a collision and continues after an extraction failure', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'review-renamer-test-'));
  const collisionSource = "Andrew's Review - Airbnb.pdf";
  const failedSource = "Broken's Review - Airbnb.pdf";
  const target = '2026-08-24-2026-08-27 - 3 nights - Andrew Review - Airbnb.pdf';
  try {
    await writeFile(path.join(directory, collisionSource), 'source');
    await writeFile(path.join(directory, failedSource), 'broken');
    await writeFile(path.join(directory, target), 'target');
    const results = await processReviewDirectory({
      directory,
      suppliedYear: 2026,
      apply: true,
      extractor: {
        extract: async (file) => {
          if (path.basename(file) === failedSource) throw new Error('unreadable PDF');
          return ocrText();
        },
      },
    });
    assert.equal(results.filter((result) => result.status === 'failed').length, 2);
    assert.equal(await readFile(path.join(directory, collisionSource), 'utf8'), 'source');
    assert.equal(await readFile(path.join(directory, target), 'utf8'), 'target');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('skips legacy date-prefixed review files without OCR', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'review-renamer-test-'));
  try {
    await writeFile(path.join(directory, '2025-01-01–2025-01-03 – 2 nights – A Review – Airbnb.pdf'), 'fixture');
    const results = await processReviewDirectory({
      directory,
      extractor: { extract: async () => assert.fail('OCR should not run') },
    });
    assert.equal(results[0].status, 'skipped');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
