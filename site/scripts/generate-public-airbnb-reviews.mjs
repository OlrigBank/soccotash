import { execFile as execFileCallback } from 'node:child_process';
import { readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

const execFile = promisify(execFileCallback);
const siteDirectory = fileURLToPath(new URL('../', import.meta.url));
const defaultReviewDirectory = fileURLToPath(
  new URL('../../docs/source-material/airbnb/reviews/', import.meta.url),
);
const defaultOutput = path.join(siteDirectory, 'src/data/public-reviews.json');
const monthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const stopLines = [
  /^Only visible to you and Airbnb$/iu,
  /^Detailed ratings$/iu,
];
const nonReviewLines = [
  /Clear instructions \(\d+\)/iu,
  /Responsive Host \(\d+\)/iu,
  /Easy to get inside \(\d+\)/iu,
  /Flexible check-in \(\d+\)/iu,
  /inside \(12\)/iu,
  /check-in\s*\(11\)/iu,
  /\+2 more/iu,
  /Squeaky-clean/iu,
  /Spotless furniture/iu,
  /Free of clutter/iu,
  /Pristine kitchen/iu,
  /Matched the description/iu,
  /Looked like the photos/iu,
  /Had listed amenities/iu,
];

function cleanPdfText(value) {
  return value.replace(/o\uFFFD/giu, 'off').replaceAll('\uFFFD', 'fi').replace(/\s+/gu, ' ').trim();
}

export function metadataFromFilename(filename) {
  const dates = [...filename.matchAll(/\d{4}-\d{2}-\d{2}/gu)].map((match) => match[0]);
  const nights = filename.match(/(\d+)\s+nights/iu);
  const reviewer = filename.match(/nights\s+[–-]+\s*(.+?)\s+Review(?:\s+Cottage)?\s+[–-]+\s+Airbnb\.pdf$/iu);
  if (dates.length < 2 || !nights || !reviewer) throw new Error(`Cannot parse review filename: ${filename}`);
  const listingKey = /Review\s+Cottage/iu.test(filename) ? 'cottage' : 'main-house';
  const startDate = new Date(`${dates[0]}T00:00:00Z`);
  return {
    startDate: dates[0],
    reviewer: reviewer[1].trim(),
    nights: Number(nights[1]),
    month: monthNames[startDate.getUTCMonth()],
    year: startDate.getUTCFullYear(),
    listingKey,
  };
}

export function extractPublicQuote(layoutText) {
  const lines = layoutText.replaceAll('\r', '').split('\n');
  const listingIndex = lines.findIndex((line) =>
    /(Olrig Bank|Cottage|bedroom in Victorian house)/iu.test(line) && !/Review/iu.test(line),
  );
  if (listingIndex < 0) throw new Error('Cannot find listing title in PDF text');

  const quoteLines = [];
  let encounteredOverlay = false;
  for (const line of lines.slice(listingIndex + 1)) {
    const trimmed = line.trim();
    if (stopLines.some((pattern) => pattern.test(trimmed))) break;
    if (!trimmed || /^\d+ of \d+/u.test(trimmed) || /^\d{2}\/\d{2}\/\d{4}/u.test(trimmed)) continue;
    if (nonReviewLines.some((pattern) => pattern.test(trimmed))) {
      encounteredOverlay = true;
      break;
    }
    const indent = line.match(/^\s*/u)?.[0].length ?? 0;
    if (indent <= 12) quoteLines.push(trimmed);
  }
  let quote = cleanPdfText(quoteLines.join(' '));
  if (encounteredOverlay) {
    const completeSentence = [...quote.matchAll(/[.!?](?:[”’"])?(?=\s|$)/gu)].at(-1);
    if (completeSentence) quote = quote.slice(0, completeSentence.index + completeSentence[0].length);
  }
  if (!quote) throw new Error('Cannot find public review text in PDF');
  return quote;
}

function slug(value) {
  return value.toLocaleLowerCase('en-GB').replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '');
}

export async function generatePublicReviews({
  directory = defaultReviewDirectory,
  output = defaultOutput,
  approvedAt = new Date().toISOString().slice(0, 10),
} = {}) {
  const filenames = (await readdir(directory))
    .filter((name) => name.toLocaleLowerCase('en-GB').endsWith('.pdf'))
    .sort((left, right) => right.localeCompare(left, 'en-GB'));
  const reviews = [];
  for (const filename of filenames) {
    const metadata = metadataFromFilename(filename);
    const { stdout } = await execFile('pdftotext', ['-layout', path.join(directory, filename), '-'], {
      maxBuffer: 4 * 1024 * 1024,
    });
    let quote;
    try {
      quote = extractPublicQuote(stdout);
    } catch (error) {
      throw new Error(`${filename}: ${error instanceof Error ? error.message : error}`, { cause: error });
    }
    reviews.push({
      id: `${metadata.listingKey}-${metadata.startDate}-${slug(metadata.reviewer)}`,
      rating: 5,
      quote,
      reviewer: { displayName: metadata.reviewer },
      stay: { nights: metadata.nights, month: metadata.month, year: metadata.year },
      listing: {
        key: metadata.listingKey,
        displayName: metadata.listingKey === 'cottage' ? 'Cottage at Olrig Bank' : 'Olrig Bank',
      },
      source: { displayName: 'Airbnb guest review' },
      publication: { approved: true, approvedAt },
    });
  }
  await writeFile(output, `${JSON.stringify({ schemaVersion: 1, reviews }, null, 2)}\n`);
  return reviews;
}

function parseArguments(args) {
  const values = {};
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--directory') values.directory = path.resolve(args[++index]);
    else if (args[index] === '--output') values.output = path.resolve(args[++index]);
    else if (args[index] === '--approved-at') values.approvedAt = args[++index];
    else throw new Error(`Unknown argument: ${args[index]}`);
  }
  return values;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const reviews = await generatePublicReviews(parseArguments(process.argv.slice(2)));
  console.log(`Generated ${reviews.length} approved public reviews.`);
}
