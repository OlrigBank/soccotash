#!/usr/bin/env node
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadReviewDocuments } from './import-airbnb-reviews.ts';
import { loadBookingDocuments } from './import-airbnb-message-bookings.ts';
import { importAirbnbReviews } from '../src/lib/airbnb-import/reviews.ts';
import { importAirbnbReservations, canonicalPayload } from '../src/lib/airbnb-import/reservations.ts';
import { reconcileAirbnbReviews } from '../src/lib/airbnb-import/reconciliation.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const requiredMigrations = ['055_airbnb_import_foundation.sql', '056_airbnb_review_reconciliation.sql', '057_airbnb_reconciliation_public_ids.sql', '066_airbnb_optional_review_publication.sql', '067_airbnb_public_reviews.sql'];
export class OperatorError extends Error {}
export function parseOptions(args) {
  if (args.some(arg => !['--apply', '--allow-production', '--help'].includes(arg))) throw new OperatorError('Unknown option. Use --help.');
  return { apply: args.includes('--apply'), allowProduction: args.includes('--allow-production'), help: args.includes('--help') };
}
export function validateTarget(value) {
  let url;
  try { url = new URL(value); } catch { throw new OperatorError('Use the External Database URL from Render, beginning postgresql://.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.username || !url.password || !/^dpg-[a-z0-9-]+\.[a-z0-9-]+-postgres\.render\.com$/i.test(url.hostname) || !/^\/[a-zA-Z0-9_-]+$/.test(url.pathname) || url.search || url.hash || (url.port && url.port !== '5432')) {
    throw new OperatorError('Use the complete external Render PostgreSQL URL (not JDBC, internal/local, or a URL with query options).');
  }
  return { hostname: url.hostname, database: url.pathname.slice(1) };
}
export function validateKey(key, version) {
  if (!/^[0-9a-f]{64}$/i.test(key)) throw new OperatorError('The existing encryption key must contain 64 hexadecimal characters.');
  if (!/^[1-9]\d*$/.test(version) || !Number.isSafeInteger(Number(version))) throw new OperatorError('Key version must be a positive integer.');
}
export function makePrompter(input = process.stdin, output = process.stdout) {
  return async (label, secret = false) => {
    if (!input.isTTY || !output.isTTY) throw new OperatorError('Run this guided command in an interactive terminal.');
    let muted = false;
    const sink = new Writable({ write(chunk, encoding, callback) { if (!muted) output.write(chunk, encoding); callback(); } });
    const rl = createInterface({ input, output: sink, terminal: true, historySize: 0 });
    if (secret) output.write(label);
    muted = secret;
    try {
      const answer = await new Promise((resolve, reject) => {
        rl.once('SIGINT', () => reject(new OperatorError('Cancelled.')));
        rl.once('close', () => reject(new OperatorError('Input closed; cancelled.')));
        rl.question(secret ? '' : label).then(resolve, reject);
      });
      return answer.trim();
    } finally { rl.close(); if (secret) output.write('\n'); }
  };
}
export async function checkMigrations(database) {
  let rows;
  try { ({ rows } = await database.query('SELECT filename, checksum FROM schema_migrations')); }
  catch { throw new OperatorError('Cannot read migration history. Deploy the application and its migrations first.'); }
  for (const filename of requiredMigrations) {
    const checksum = createHash('sha256').update(await readFile(path.join(root, 'site/db', filename))).digest('hex');
    if (!rows.some(row => row.filename === filename && row.checksum === checksum)) throw new OperatorError(`Missing or mismatched migration ${filename}. Deploy the matching application revision first.`);
  }
}
export async function counts(database) {
  return (await database.query(`SELECT
    (SELECT count(*)::int FROM airbnb_reviews) AS reviews,
    (SELECT count(*)::int FROM airbnb_reservations) AS bookings,
    (SELECT count(*)::int FROM airbnb_source_documents) AS documents`)).rows[0];
}
export async function inspectDocuments(database, groups, verify = false) {
  let existing = 0;
  for (const [kind, documents] of Object.entries(groups)) for (const document of documents) {
    const type = kind === 'reviews' ? 'review' : 'booking';
    const id = kind === 'reviews' ? document.review.source.reviewId : document.booking.source.conversationId;
    if (kind === 'reviews' && (await database.query('SELECT id FROM airbnb_reviews WHERE review_id=$1', [id])).rows.length) {
      existing++;
      continue;
    }
    const evidence = await database.query('SELECT sha256, relative_path, document_type, source_external_id, raw_extraction FROM airbnb_source_documents WHERE sha256=$1 OR relative_path=$2', [document.sha256, document.relativePath]);
    if (evidence.rows.some(row => row.sha256 !== document.sha256 || row.document_type !== type || row.source_external_id !== id)) throw new OperatorError(`Conflicting ${type} evidence for source ID ${id}; inspect privately before retrying.`);
    if (kind === 'bookings' && evidence.rows.some(row => row.sha256 === document.sha256
      && (!isDeepStrictEqual(canonicalPayload(row.raw_extraction), canonicalPayload(document.booking))
        || !isDeepStrictEqual(row.raw_extraction.financialSummaries, document.booking.financialSummaries)))) {
      throw new OperatorError(`Same booking source hash has different parsed content for source ID ${id}.`);
    }
    const stored = await database.query(kind === 'reviews'
      ? `SELECT s.raw_extraction FROM airbnb_reviews r JOIN airbnb_source_documents s ON s.id=r.source_document_id WHERE r.review_id=$1`
      : `SELECT s.raw_extraction FROM airbnb_reservations r JOIN airbnb_reservation_documents d ON d.reservation_id=r.id AND d.is_preferred JOIN airbnb_source_documents s ON s.id=d.source_document_id WHERE r.conversation_id=$1`, [id]);
    if (stored.rows.length) existing++;
    // Existing reviews are skipped permanently, including changed recaptures.
    // Booking evidence is retained even when it is older than the current record.
    if (verify && (!stored.rows.length || (kind === 'bookings' && !evidence.rows.some(row => row.sha256 === document.sha256)))) {
      throw new OperatorError(`Post-import verification failed for ${type} source ID ${id}.`);
    }
  }
  return { selected: Object.values(groups).flat().length, existing };
}
export async function executeImport(database, groups, report, notify = console.log) {
  for (const kind of ['reviews', 'bookings']) {
    if (!groups[kind]) continue;
    report.stage = kind;
    const documents = groups[kind];
    const snapshot = documents.map(d => (kind === 'reviews' ? d.review.source.capturedAt : d.booking.source.capturedAt).slice(0, 10)).sort().at(-1);
    const result = kind === 'reviews'
      ? await importAirbnbReviews({ sourceSnapshotOn: snapshot, documents }, database)
      : await importAirbnbReservations({ sourceSnapshotOn: snapshot, documents }, database);
    report.completed.push({ step: kind, ...result });
    notify(`${kind}: completed, batch ${result.batchId}.`);
    if (kind === 'reviews') notify(`${result.reviewsAdded} new reviews, ${result.reviewsUnchanged} existing reviews preserved.`);
    if (kind === 'bookings') notify(`${result.reservationsAdded} new, ${result.reservationsUpdated} updated, ${result.reservationsUnchanged} unchanged bookings.`);
  }
  report.stage = 'reconciliation';
  report.reconciliation = await reconcileAirbnbReviews(database);
  report.completed.push({ step: 'reconciliation' });
  report.stage = 'verification';
  await inspectDocuments(database, groups, true);
  report.after = await counts(database);
  report.status = 'completed';
}
export async function main(args = process.argv.slice(2), ask = makePrompter()) {
  const options = parseOptions(args);
  if (options.help) {
    console.log('Guided Airbnb import: npm run airbnb:import [-- --apply [--allow-production]]\nDefault: read-only preflight. Choose target, capture run and reviews/bookings/both interactively.\nSecrets are hidden and never saved. No migrations or publication decisions are performed.');
    return;
  }
  const target = await ask('Target (development / production): ');
  if (!['development', 'production'].includes(target)) throw new OperatorError('Choose development or production.');
  if (options.apply && target === 'production' && !options.allowProduction) throw new OperatorError('Production writes require both --apply and --allow-production.');
  let runs;
  try { runs = (await readdir(path.join(root, 'output/pdf/airbnb-terminal'), { withFileTypes: true })).filter(d => d.isDirectory() && /^[a-zA-Z0-9_-]+$/.test(d.name)).map(d => d.name).sort(); }
  catch { throw new OperatorError('No capture runs found. Run airbnb:capture first.'); }
  console.log(`Available capture runs: ${runs.join(', ')}`);
  const run = await ask('Capture run name (from the list above): ');
  if (!runs.includes(run)) throw new OperatorError('Choose an existing capture run from the list.');
  const scope = await ask('Import reviews / bookings / both: ');
  if (!['reviews', 'bookings', 'both'].includes(scope)) throw new OperatorError('Choose reviews, bookings or both.');
  console.log(`DATABASE_URL: Render dashboard → ${target} PostgreSQL database → Connect → External Database URL. Copy the complete postgresql:// URL, not JDBC or the internal URL.`);
  const databaseUrl = await ask('External Database URL (hidden): ', true);
  const identity = validateTarget(databaseUrl);
  let key, version;
  if (scope !== 'reviews') {
    console.log(`AIRBNB_IMPORT_ENCRYPTION_KEY: Render → ${target === 'development' ? 'soccotash' : 'olrigbankweb'} application service → Environment → existing AIRBNB_IMPORT_ENCRYPTION_KEY, or the secure store used for its previous import. Use this environment’s key; do not generate a replacement or use the primary-local key.`);
    key = await ask('Existing encryption key (hidden): ', true);
    console.log('AIRBNB_IMPORT_ENCRYPTION_KEY_VERSION: use the version associated with that key in the same Environment settings or secure store. The importer default is 1.');
    version = await ask('Encryption key version [1]: ') || '1';
    validateKey(key, version);
  }
  console.log(`Target: ${target}; host: ${identity.hostname}; database: ${identity.database}; run: ${run}; scope: ${scope}.`);
  if (await ask(`Check this is the intended ${target} database. Type its database name to continue: `) !== identity.database) throw new OperatorError('Target confirmation did not match; cancelled.');
  const groups = {};
  // All PDFs and required JSON sidecars are parsed before connecting or writing.
  try {
    if (scope !== 'bookings') groups.reviews = await loadReviewDocuments(path.join(root, 'output/pdf/airbnb-terminal', run, 'reviews'));
    if (scope !== 'reviews') groups.bookings = await loadBookingDocuments([path.join(root, 'output/pdf/airbnb-terminal', run, 'bookings')], Buffer.from(key, 'hex'), Number(version));
  } catch { throw new OperatorError('Source validation failed. Check selected folders, PDF tools (pdfinfo/pdftotext), verified PDFs and original booking JSON sidecars. No database writes were attempted.'); }
  const database = new pg.Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false }, max: 1, connectionTimeoutMillis: 15000 });
  const report = { target, ...identity, run, scope, mode: options.apply ? 'apply' : 'preflight', startedAt: new Date().toISOString(), status: 'failed', stage: 'preflight', completed: [], hashes: Object.values(groups).flat().map(d => d.sha256).sort() };
  const reportDirectory = path.join(root, '.airbnb-capture/import-reports');
  const reportPath = path.join(reportDirectory, `${Date.now()}-${randomUUID()}.json`);
  // Ensure the report can be retained before any import starts.
  await mkdir(reportDirectory, { recursive: true, mode: 0o700 });
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  try {
    await checkMigrations(database);
    await database.query('BEGIN READ ONLY');
    try {
      report.before = await counts(database);
      report.preflight = await inspectDocuments(database, groups);
    } finally { await database.query('ROLLBACK'); }
    console.log(`Preflight: ${report.preflight.selected} selected documents; ${report.preflight.existing} existing records (reviews will be preserved; newer bookings will be updated). Database counts: ${JSON.stringify(report.before)}.`);
    if (!options.apply) {
      report.status = 'preflight-passed';
      console.log('Preflight passed; no database changes made. Rerun with --apply to import (also --allow-production for production).');
      return;
    }
    if (await ask(`Confirm a current ${target} backup exists and no deployment is running. Type "import ${target}" to write: `) !== `import ${target}`) throw new OperatorError('Import cancelled before writes.');
    await executeImport(database, groups, report);
    console.log(`Import and reconciliation verified. Counts: ${JSON.stringify(report.after)}. Review results in Admin → Airbnb; publish reviews separately if approved.`);
  } catch (error) {
    console.error(`Stopped during ${report.stage}. Completed steps: ${report.completed.map(s => s.step).join(', ') || 'none'}. Earlier completed steps remain committed; inspect before retrying.`);
    throw error;
  } finally {
    report.finishedAt = new Date().toISOString();
    try { await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 }); console.log(`Private report: ${reportPath}`); }
    finally { await database.end(); }
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    // Parser/driver errors can contain raw guest text, credentials or SQL parameters.
    console.error(error instanceof OperatorError ? error.message : 'Import failed. Check database connectivity, credentials and source conflicts privately. No raw error or secrets have been printed.');
    process.exitCode = 1;
  });
}
