import { execFile as execFileCallback } from 'node:child_process';
import { access, link, mkdtemp, readdir, rm, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createWorker } from 'tesseract.js';
import englishLanguage from '@tesseract.js-data/eng';

const execFile = promisify(execFileCallback);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
export const defaultReviewDirectory = path.resolve(
  scriptDirectory,
  '../../docs/source-material/airbnb/reviews',
);

const monthNumbers = new Map(
  [
    'january',
    'february',
    'march',
    'april',
    'may',
    'june',
    'july',
    'august',
    'september',
    'october',
    'november',
    'december',
  ].map((month, index) => [month, index + 1]),
);

const listingMappings = [
  {
    title: 'olrig bank: spacious, but cosy, with large garden',
    suffix: '',
  },
  {
    title: 'cosy cottage, heart of kendal, parking, big garden',
    suffix: ' Cottage',
  },
];

const canonicalNamePattern =
  /^\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2} - \d+ nights - .+ Review(?: Cottage)? - Airbnb\.pdf$/u;
const datePrefixedLegacyPattern = /^\d{4}-\d{2}-\d{2}/u;

export class ReviewExtractionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ReviewExtractionError';
    this.code = code;
  }
}

function normaliseOcrText(text) {
  return text
    .normalize('NFKC')
    .replace(/[‐‑‒–—−]/gu, '-')
    .replace(/[·•]/gu, '-')
    .replace(/\r/gu, '');
}

function parseReviewer(lines) {
  for (const line of lines) {
    const match = line.match(/^(.+?)[’']s\s+review\s*$/iu);
    if (match) return sanitiseReviewer(match[1]);
  }
  throw new ReviewExtractionError('reviewer-missing', 'reviewer heading was not found');
}

function sanitiseReviewer(value) {
  const safe = value
    .normalize('NFC')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .replace(/[. ]+$/gu, '');
  if (!safe) {
    throw new ReviewExtractionError('reviewer-invalid', 'reviewer name is not filename-safe');
  }
  return safe;
}

function parseListing(lines) {
  const normalisedLines = lines.map((line) => line.toLocaleLowerCase('en-GB'));
  const mapping = listingMappings.find(({ title }) =>
    normalisedLines.some((line) => line.includes(title)),
  );
  if (!mapping) {
    throw new ReviewExtractionError('listing-unsupported', 'listing title is unsupported');
  }
  return mapping;
}

function parseStayRange(lines, suppliedYear) {
  const sameMonth =
    /\b(\d{1,2})\s*-\s*(\d{1,2})\s+([A-Za-z]+)(?:\s+(\d{4}))?\s*-\s*(\d+)\s+nights?\b/iu;
  const splitMonth =
    /\b(\d{1,2})\s+([A-Za-z]+)(?:\s+(\d{4}))?\s*-\s*(\d{1,2})\s+([A-Za-z]+)(?:\s+(\d{4}))?\s*-\s*(\d+)\s+nights?\b/iu;

  for (const line of lines) {
    const splitMatch = line.match(splitMonth);
    if (splitMatch) {
      return buildStayRange(
        {
          startDay: Number(splitMatch[1]),
          startMonth: splitMatch[2],
          startYear: splitMatch[3],
          endDay: Number(splitMatch[4]),
          endMonth: splitMatch[5],
          endYear: splitMatch[6],
          displayedNights: Number(splitMatch[7]),
        },
        suppliedYear,
      );
    }

    const sameMatch = line.match(sameMonth);
    if (sameMatch) {
      return buildStayRange(
        {
          startDay: Number(sameMatch[1]),
          endDay: Number(sameMatch[2]),
          startMonth: sameMatch[3],
          endMonth: sameMatch[3],
          startYear: sameMatch[4],
          endYear: sameMatch[4],
          displayedNights: Number(sameMatch[5]),
        },
        suppliedYear,
      );
    }
  }

  throw new ReviewExtractionError('stay-missing', 'stay range and duration were not found');
}

function buildStayRange(fields, suppliedYear) {
  const startMonth = monthNumbers.get(fields.startMonth.toLocaleLowerCase('en-GB'));
  const endMonth = monthNumbers.get(fields.endMonth.toLocaleLowerCase('en-GB'));
  if (!startMonth || !endMonth) {
    throw new ReviewExtractionError('month-invalid', 'stay range contains an invalid month');
  }

  let startYear = fields.startYear ? Number(fields.startYear) : suppliedYear;
  let endYear = fields.endYear ? Number(fields.endYear) : undefined;
  if (!startYear) {
    throw new ReviewExtractionError(
      'year-required',
      'stay year is absent; re-run with --year YYYY',
    );
  }
  if (!Number.isInteger(startYear) || startYear < 2000 || startYear > 2100) {
    throw new ReviewExtractionError('year-invalid', 'stay year must be between 2000 and 2100');
  }
  if (!endYear) endYear = startYear + (endMonth < startMonth ? 1 : 0);

  const startDate = validatedUtcDate(startYear, startMonth, fields.startDay);
  const endDate = validatedUtcDate(endYear, endMonth, fields.endDay);
  const calculatedNights = (endDate.getTime() - startDate.getTime()) / 86_400_000;
  if (!Number.isInteger(calculatedNights) || calculatedNights <= 0) {
    throw new ReviewExtractionError('date-range-invalid', 'checkout must be after check-in');
  }
  if (calculatedNights !== fields.displayedNights) {
    throw new ReviewExtractionError(
      'duration-mismatch',
      `date range is ${calculatedNights} nights but Airbnb displays ${fields.displayedNights}`,
    );
  }

  return {
    startDate: formatDate(startDate),
    endDate: formatDate(endDate),
    nights: fields.displayedNights,
  };
}

function validatedUtcDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new ReviewExtractionError('date-invalid', 'stay range contains an invalid date');
  }
  return date;
}

function formatDate(date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

export function extractReviewMetadata(ocrText, suppliedYear) {
  const lines = normaliseOcrText(ocrText)
    .split('\n')
    .map((line) => line.replace(/\s+/gu, ' ').trim())
    .filter(Boolean);
  const reviewer = parseReviewer(lines);
  const listing = parseListing(lines);
  const stay = parseStayRange(lines, suppliedYear);
  return { reviewer, listingSuffix: listing.suffix, ...stay };
}

export function canonicalFilename(metadata) {
  return `${metadata.startDate}-${metadata.endDate} - ${metadata.nights} nights - ${metadata.reviewer} Review${metadata.listingSuffix} - Airbnb.pdf`;
}

export async function createOcrExtractor() {
  let worker;
  return {
    async extract(pdfPath) {
      const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'olrig-airbnb-review-'));
      const imagePrefix = path.join(temporaryDirectory, 'page');
      const imagePath = `${imagePrefix}.png`;
      try {
        await execFile('pdftoppm', [
          '-f',
          '1',
          '-singlefile',
          '-png',
          '-r',
          '180',
          pdfPath,
          imagePrefix,
        ]);
        worker ??= await createWorker('eng', undefined, {
          langPath: englishLanguage.langPath,
          cacheMethod: 'none',
          logger: () => {},
        });
        const result = await worker.recognize(imagePath);
        return result.data.text;
      } finally {
        await rm(temporaryDirectory, { recursive: true, force: true });
      }
    },
    async close() {
      if (worker) await worker.terminate();
    },
  };
}

async function pathExists(filePath) {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function renameWithoutOverwrite(sourcePath, targetPath) {
  await link(sourcePath, targetPath);
  try {
    await unlink(sourcePath);
  } catch (error) {
    await unlink(targetPath).catch(() => {});
    throw error;
  }
}

export async function processReviewDirectory({
  directory = defaultReviewDirectory,
  suppliedYear,
  apply = false,
  extractor,
} = {}) {
  const ownExtractor = extractor ? undefined : await createOcrExtractor();
  const activeExtractor = extractor ?? ownExtractor;
  const results = [];
  try {
    const entries = (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.toLocaleLowerCase('en-GB').endsWith('.pdf'))
      .sort((left, right) => left.name.localeCompare(right.name, 'en-GB'));

    for (const entry of entries) {
      if (canonicalNamePattern.test(entry.name) || datePrefixedLegacyPattern.test(entry.name)) {
        results.push({ source: entry.name, status: 'skipped', reason: 'already organised' });
        continue;
      }

      const sourcePath = path.join(directory, entry.name);
      try {
        const metadata = extractReviewMetadata(
          await activeExtractor.extract(sourcePath),
          suppliedYear,
        );
        const target = canonicalFilename(metadata);
        const targetPath = path.join(directory, target);
        if (await pathExists(targetPath)) {
          throw new ReviewExtractionError('target-exists', 'target filename already exists');
        }
        if (apply) await renameWithoutOverwrite(sourcePath, targetPath);
        results.push({ source: entry.name, target, status: apply ? 'renamed' : 'proposed' });
      } catch (error) {
        results.push({
          source: entry.name,
          status: 'failed',
          reason: error instanceof Error ? error.message : 'unknown failure',
        });
      }
    }
  } finally {
    await ownExtractor?.close();
  }
  return results;
}

export function parseArguments(arguments_) {
  let suppliedYear;
  let apply = false;
  let directory = defaultReviewDirectory;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === '--apply') {
      apply = true;
    } else if (argument === '--year') {
      const value = arguments_[index + 1];
      if (!value || !/^\d{4}$/u.test(value)) {
        throw new Error('--year requires a four-digit year');
      }
      suppliedYear = Number(value);
      index += 1;
    } else if (argument === '--directory') {
      const value = arguments_[index + 1];
      if (!value) throw new Error('--directory requires a path');
      directory = path.resolve(value);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return { suppliedYear, apply, directory };
}

function printResults(results) {
  for (const result of results) {
    if (result.status === 'proposed') {
      console.log(`PROPOSED ${JSON.stringify(result.source)} -> ${JSON.stringify(result.target)}`);
    } else if (result.status === 'renamed') {
      console.log(`RENAMED ${JSON.stringify(result.source)} -> ${JSON.stringify(result.target)}`);
    } else if (result.status === 'failed') {
      console.error(`FAILED ${JSON.stringify(result.source)}: ${result.reason}`);
    }
  }
  const counts = Object.fromEntries(
    ['proposed', 'renamed', 'skipped', 'failed'].map((status) => [
      status,
      results.filter((result) => result.status === status).length,
    ]),
  );
  console.log(
    `Summary: ${counts.proposed} proposed, ${counts.renamed} renamed, ${counts.skipped} skipped, ${counts.failed} failed.`,
  );
  return counts.failed === 0 ? 0 : 1;
}

async function main() {
  try {
    const results = await processReviewDirectory(parseArguments(process.argv.slice(2)));
    process.exitCode = printResults(results);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
