import { execFile as execFileCallback } from 'node:child_process';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

const execFile = promisify(execFileCallback);
const repositoryDirectory = fileURLToPath(new URL('../../', import.meta.url));
const defaultPdfDirectory = path.join(repositoryDirectory, 'output/pdf/airbnb-reviews');
const defaultPrivateOutput = path.join(
  repositoryDirectory,
  'docs/source-material/airbnb/reviews/private-review-manifest.json',
);
const defaultPublicOutput = path.join(repositoryDirectory, 'site/src/data/public-reviews.json');
const defaultSummaryOutput = path.join(repositoryDirectory, 'site/src/data/public-review-summary.json');
const privateSchemaPath = path.join(repositoryDirectory, 'docs/source-material/airbnb/private-review-manifest.schema.json');
const categories = ['Check-in', 'Cleanliness', 'Accuracy', 'Communication', 'Location', 'Value'];
const months = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function clean(value) {
  return value.replaceAll('\uFFFD', 'fi').replace(/\s+/gu, ' ').trim();
}

function isoDate(month, day, year) {
  const monthIndex = months.indexOf(month);
  if (monthIndex < 0) throw new Error(`Unsupported month: ${month}`);
  const date = new Date(Date.UTC(year, monthIndex, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== monthIndex || date.getUTCDate() !== day) {
    throw new Error(`Invalid date: ${month} ${day}, ${year}`);
  }
  return date.toISOString().slice(0, 10);
}

function dateParts(value, fallbackMonth) {
  const match = value.trim().match(new RegExp(`^(${months.join('|')})?\\s*(\\d{1,2})(?:,\\s*(\\d{4}))?$`, 'u'));
  if (!match) throw new Error(`Cannot parse date: ${value}`);
  return { month: match[1] ?? fallbackMonth, day: Number(match[2]), year: match[3] ? Number(match[3]) : null };
}

export function parseStayLine(line) {
  const match = clean(line).match(/^(.+?)\s+[–-]\s+(.+?)\s+-\s+(\d+) nights\s+·\s+Published\s+(.+)$/u);
  if (!match) throw new Error(`Cannot parse stay line: ${line}`);
  const published = dateParts(match[4]);
  if (!published.year) throw new Error(`Published date has no year: ${line}`);
  const start = dateParts(match[1]);
  const end = dateParts(match[2], start.month);
  end.year ??= published.year;
  start.year ??= start.month === 'December' && end.month === 'January' ? end.year - 1 : end.year;
  const checkIn = isoDate(start.month, start.day, start.year);
  const checkOut = isoDate(end.month, end.day, end.year);
  const nights = Number(match[3]);
  const calculatedNights = (Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) / 86_400_000;
  if (calculatedNights !== nights) throw new Error(`Stay dates span ${calculatedNights} nights, not ${nights}`);
  return {
    checkIn,
    checkOut,
    nights,
    publishedAt: isoDate(published.month, published.day, published.year),
  };
}

function listingFromTitle(displayName) {
  if (/Cosy Cottage/iu.test(displayName)) return { key: 'cottage', displayName: 'Cottage at Olrig Bank', sourceDisplayName: displayName };
  if (/(Olrig Bank|bedroom in Victorian house)/iu.test(displayName)) {
    return { key: 'main-house', displayName: 'Olrig Bank', sourceDisplayName: displayName };
  }
  throw new Error(`Unsupported listing: ${displayName}`);
}

function textBetween(lines, start, boundaries) {
  const end = lines.findIndex((line, index) => index > start && boundaries.some((pattern) => pattern.test(line.trim())));
  return clean(lines.slice(start + 1, end < 0 ? lines.length : end).filter((line) => line.trim()).join(' '));
}

function uniqueStrings(values) {
  const seen = new Set();
  return values.filter((value) => {
    const key = clean(value).toLocaleLowerCase('en-GB');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function parseDetailedRatings(lines, startIndex, endIndex) {
  const ratings = [];
  let current = null;
  for (const rawLine of lines.slice(startIndex + 1, endIndex)) {
    const line = rawLine.trim();
    if (!line) continue;
    const heading = line.match(/^(Check-in|Cleanliness|Accuracy|Communication|Location|Value)\s+★+\s+([1-5])(?:\s+(.*))?$/u);
    if (heading) {
      current = { category: heading[1], rating: Number(heading[2]), feedbackText: heading[3] ?? '' };
      ratings.push(current);
    } else if (current) {
      current.feedbackText = `${current.feedbackText} ${line}`.trim();
    }
  }
  return ratings.map(({ category, rating, feedbackText }) => ({
    category,
    rating,
    feedback: uniqueStrings(feedbackText.split(';').map(clean)),
  }));
}

export function parseReviewPdfText(layoutText, filename) {
  const lines = layoutText.replaceAll('\r', '').split('\n');
  const headingIndex = lines.findIndex((line) => /'s review\s*$/iu.test(line.trim()));
  const stayIndex = lines.findIndex((line) => /nights\s+·\s+Published/iu.test(line));
  const publicIndex = lines.findIndex((line) => /^\s*Public review\b/iu.test(line));
  const detailedIndex = lines.findIndex((line) => /^\s*Detailed ratings\s*$/iu.test(line));
  const footerIndex = lines.findIndex((line) => /Airbnb review ID\s+\d+/iu.test(line));
  if ([headingIndex, stayIndex, publicIndex, detailedIndex, footerIndex].some((index) => index < 0)) {
    throw new Error(`${filename}: missing a required review section`);
  }
  const reviewer = clean(lines[headingIndex]).replace(/['’]s review$/iu, '');
  const listing = listingFromTitle(clean(lines[headingIndex + 1]));
  const stay = parseStayLine(lines[stayIndex]);
  const publicLabel = clean(lines[publicIndex]);
  const overallMatch = publicLabel.match(/★+\s+([1-5])$/u);
  if (!overallMatch) throw new Error(`${filename}: missing overall rating`);
  const noteIndex = lines.findIndex((line, index) => index > publicIndex && index < detailedIndex && /^\s*Note from\b/iu.test(line));
  const publicText = textBetween(lines, publicIndex, [/^Note from\b/iu, /^Detailed ratings$/iu]);
  let privateText = null;
  if (noteIndex >= 0) {
    const visibilityIndex = lines.findIndex((line, index) => index > noteIndex && index < detailedIndex && /^\s*Only visible to you and Airbnb\s*$/iu.test(line));
    if (visibilityIndex < 0) throw new Error(`${filename}: private note has no visibility boundary`);
    privateText = textBetween(lines, visibilityIndex, [/^Detailed ratings$/iu]);
  }
  const footer = clean(lines[footerIndex]);
  const footerMatch = footer.match(/Airbnb review ID\s+(\d+)\s+·\s+Captured\s+(.+)$/u);
  if (!footerMatch) throw new Error(`${filename}: malformed capture footer`);
  const captured = dateParts(footerMatch[2]);
  if (!captured.year) throw new Error(`${filename}: capture date has no year`);
  const detailedRatings = parseDetailedRatings(lines, detailedIndex, footerIndex);
  if (detailedRatings.length !== categories.length || detailedRatings.some((rating, index) => rating.category !== categories[index])) {
    throw new Error(`${filename}: expected the six ordered detailed-rating categories`);
  }
  if (!publicText) throw new Error(`${filename}: public review is empty`);
  return {
    id: `airbnb-${footerMatch[1]}`,
    source: { platform: 'airbnb', reviewId: footerMatch[1], pdfFilename: filename, capturedAt: isoDate(captured.month, captured.day, captured.year) },
    reviewer: { displayName: reviewer },
    listing,
    stay: { checkIn: stay.checkIn, checkOut: stay.checkOut, nights: stay.nights },
    publishedAt: stay.publishedAt,
    publicReview: { rating: Number(overallMatch[1]), text: publicText },
    privateFeedback: privateText ? { text: privateText } : null,
    detailedRatings,
  };
}

function publicId(review) {
  const slug = review.reviewer.displayName.toLocaleLowerCase('en-GB').replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '');
  return `${review.listing.key}-${review.stay.checkIn}-${slug}`;
}

export function toPublicReview(review, approvedAt) {
  const date = new Date(`${review.stay.checkIn}T00:00:00Z`);
  return {
    id: publicId(review),
    rating: review.publicReview.rating,
    quote: review.publicReview.text,
    reviewer: { displayName: review.reviewer.displayName },
    stay: { nights: review.stay.nights, month: months[date.getUTCMonth()], year: date.getUTCFullYear() },
    listing: { key: review.listing.key, displayName: review.listing.displayName },
    source: { displayName: 'Airbnb guest review' },
    publication: { approved: true, approvedAt },
  };
}

export function toPublicReviewSummary(reviews, approvedAt) {
  const overallScore = reviews.reduce((sum, review) => sum + review.publicReview.rating, 0) / reviews.length;
  return {
    schemaVersion: 1,
    reviewCount: reviews.length,
    scale: 5,
    overallScore: Number(overallScore.toFixed(2)),
    categories: categories.map((displayName) => {
      const values = reviews.map((review) => review.detailedRatings.find((rating) => rating.category === displayName)?.rating);
      if (values.some((value) => !Number.isInteger(value))) throw new Error(`Missing ${displayName} rating in summary source`);
      const score = values.reduce((sum, value) => sum + value, 0) / values.length;
      return {
        key: displayName.toLocaleLowerCase('en-GB').replace(/[^a-z0-9]+/gu, '-'),
        displayName,
        score: Number(score.toFixed(2)),
      };
    }),
    source: { displayName: 'Airbnb detailed ratings' },
    publication: { approved: true, approvedAt },
  };
}

async function existingApprovalDates(output) {
  try {
    const data = JSON.parse(await readFile(output, 'utf8'));
    return new Map(data.reviews.map((review) => [review.id, review.publication.approvedAt]));
  } catch (error) {
    if (error?.code === 'ENOENT') return new Map();
    throw error;
  }
}

export async function generateReviewDatasets({
  directory = defaultPdfDirectory,
  privateOutput = defaultPrivateOutput,
  publicOutput = defaultPublicOutput,
  summaryOutput = defaultSummaryOutput,
  approvedAt = new Date().toISOString().slice(0, 10),
} = {}) {
  const filenames = (await readdir(directory)).filter((name) => name.endsWith('.pdf')).sort((a, b) => a.localeCompare(b, 'en-GB', { numeric: true }));
  const byReviewId = new Map();
  for (const filename of filenames) {
    const { stdout } = await execFile('pdftotext', ['-layout', path.join(directory, filename), '-'], { maxBuffer: 4 * 1024 * 1024 });
    const review = parseReviewPdfText(stdout, filename);
    const previous = byReviewId.get(review.source.reviewId);
    if (previous && JSON.stringify(previous) !== JSON.stringify(review)) throw new Error(`Conflicting captures for Airbnb review ${review.source.reviewId}`);
    byReviewId.set(review.source.reviewId, review);
  }
  const reviews = [...byReviewId.values()].sort((a, b) => b.stay.checkIn.localeCompare(a.stay.checkIn) || b.source.reviewId.localeCompare(a.source.reviewId));
  const privateData = { schemaVersion: 1, reviews };
  const privateSchema = JSON.parse(await readFile(privateSchemaPath, 'utf8'));
  const validatePrivateData = new Ajv2020({ allErrors: true }).compile(privateSchema);
  if (!validatePrivateData(privateData)) {
    throw new Error(`Private review manifest failed schema validation: ${JSON.stringify(validatePrivateData.errors)}`);
  }
  const approvals = await existingApprovalDates(publicOutput);
  const publicReviews = reviews.map((review) => {
    const id = publicId(review);
    return toPublicReview(review, approvals.get(id) ?? approvedAt);
  });
  const publicSummary = toPublicReviewSummary(reviews, approvedAt);
  await writeFile(privateOutput, `${JSON.stringify(privateData, null, 2)}\n`);
  await writeFile(publicOutput, `${JSON.stringify({ schemaVersion: 1, reviews: publicReviews }, null, 2)}\n`);
  await writeFile(summaryOutput, `${JSON.stringify(publicSummary, null, 2)}\n`);
  return { privateData, publicReviews, publicSummary };
}

function parseArguments(args) {
  const values = {};
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--directory') values.directory = path.resolve(args[++index]);
    else if (args[index] === '--private-output') values.privateOutput = path.resolve(args[++index]);
    else if (args[index] === '--public-output') values.publicOutput = path.resolve(args[++index]);
    else if (args[index] === '--summary-output') values.summaryOutput = path.resolve(args[++index]);
    else if (args[index] === '--approved-at') values.approvedAt = args[++index];
    else throw new Error(`Unknown argument: ${args[index]}`);
  }
  return values;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await generateReviewDatasets(parseArguments(process.argv.slice(2)));
  console.log(`Generated ${result.privateData.reviews.length} private records, ${result.publicReviews.length} public records, and one public ratings summary.`);
}
