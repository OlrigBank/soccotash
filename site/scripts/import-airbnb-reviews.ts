#!/usr/bin/env node

import { execFile as execFileCallback } from 'node:child_process';
import crypto from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { parseReviewPdfText } from './generate-airbnb-review-datasets.mjs';
import {
  importAirbnbReviews,
  type AirbnbReviewImportDocument,
  type ParsedAirbnbReview,
} from '../src/lib/airbnb-import/reviews.ts';

const execFile = promisify(execFileCallback);
const { Pool } = pg;
const siteDirectory = fileURLToPath(new URL('../', import.meta.url));
const repositoryDirectory = path.resolve(siteDirectory, '..');
const defaultDirectory = path.join(repositoryDirectory, 'output/pdf/airbnb-reviews');

function parseArguments(args: string[]): { directory: string } {
  let directory = defaultDirectory;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--directory') directory = path.resolve(args[++index]);
    else throw new Error(`Unknown argument: ${args[index]}`);
  }
  return { directory };
}

function pageCount(pdfInfo: string, filename: string): number {
  const match = pdfInfo.match(/^Pages:\s+(\d+)$/mu);
  const pages = match ? Number(match[1]) : 0;
  if (!Number.isInteger(pages) || pages < 1) throw new Error(`${filename}: invalid PDF page count`);
  return pages;
}

function databaseSsl(): { rejectUnauthorized: false } | undefined {
  return process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined;
}

const { directory } = parseArguments(process.argv.slice(2));
const relativeDirectory = path.relative(repositoryDirectory, directory);
if (!relativeDirectory || relativeDirectory.startsWith('..') || path.isAbsolute(relativeDirectory)) {
  throw new Error('Review directory must be a private path inside the repository.');
}

const filenames = (await readdir(directory))
  .filter((filename) => filename.toLocaleLowerCase('en-GB').endsWith('.pdf'))
  .sort((left, right) => left.localeCompare(right, 'en-GB', { numeric: true }));
if (!filenames.length) throw new Error('No Airbnb review PDFs found.');

const documents: AirbnbReviewImportDocument[] = [];
for (const filename of filenames) {
  const pdfPath = path.join(directory, filename);
  const [buffer, extracted, metadata] = await Promise.all([
    readFile(pdfPath),
    execFile('pdftotext', ['-layout', pdfPath, '-'], { maxBuffer: 4 * 1024 * 1024 }),
    execFile('pdfinfo', [pdfPath], { maxBuffer: 1024 * 1024 }),
  ]);
  const review = parseReviewPdfText(extracted.stdout, filename) as ParsedAirbnbReview;
  documents.push({
    relativePath: path.relative(repositoryDirectory, pdfPath),
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
    pageCount: pageCount(metadata.stdout, filename),
    capturedAt: `${review.source.capturedAt}T00:00:00.000Z`,
    review,
  });
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');
const database = new Pool({ connectionString: databaseUrl, ssl: databaseSsl(), max: 2 });
try {
  const sourceSnapshotOn = documents
    .map((document) => document.review.source.capturedAt)
    .sort()
    .at(-1)!;
  const result = await importAirbnbReviews({ sourceSnapshotOn, documents }, database);
  console.log(
    `Airbnb review import batch ${result.batchId} completed: `
    + `${result.documentsProcessed} documents processed, ${result.documentsAdded} documents added, `
    + `${result.reviewsAdded} reviews added, ${result.reviewsUnchanged} reviews unchanged.`,
  );
} finally {
  await database.end();
}
