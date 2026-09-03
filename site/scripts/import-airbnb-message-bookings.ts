#!/usr/bin/env node

import { execFile as execFileCallback } from 'node:child_process';
import crypto from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { parseAirbnbBookingPdfText } from '../src/lib/airbnb-import/booking-pdf.ts';
import { importAirbnbReservations, type AirbnbBookingImportDocument } from '../src/lib/airbnb-import/reservations.ts';

const execFile = promisify(execFileCallback);
const { Pool } = pg;
const siteDirectory = fileURLToPath(new URL('../', import.meta.url));
const repositoryDirectory = path.resolve(siteDirectory, '..');
const defaultDirectories = [
  path.join(repositoryDirectory, 'output/pdf/airbnb-message-bookings'),
  path.join(repositoryDirectory, 'output/pdf/airbnb-message-bookings-active-2026-09-01'),
];

function encryptionKey(): Buffer {
  const configured = process.env.AIRBNB_IMPORT_ENCRYPTION_KEY;
  if (!configured || !/^[0-9a-f]{64}$/iu.test(configured)) {
    throw new Error('AIRBNB_IMPORT_ENCRYPTION_KEY must be a 64-character hexadecimal key.');
  }
  return Buffer.from(configured, 'hex');
}

function encryptAccessCode(value: string, key: Buffer): Buffer {
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]);
}

function pageCount(pdfInfo: string, filename: string): number {
  const match = pdfInfo.match(/^Pages:\s+(\d+)$/mu);
  const pages = match ? Number(match[1]) : 0;
  if (!Number.isInteger(pages) || pages < 1) throw new Error(`${filename}: invalid PDF page count`);
  return pages;
}

const directories = process.argv.length > 2 ? process.argv.slice(2).map((value) => path.resolve(value)) : defaultDirectories;
const key = encryptionKey();
const documents: AirbnbBookingImportDocument[] = [];
for (const directory of directories) {
  const relativeDirectory = path.relative(repositoryDirectory, directory);
  if (!relativeDirectory || relativeDirectory.startsWith('..') || path.isAbsolute(relativeDirectory)) {
    throw new Error('Booking directories must be private paths inside the repository.');
  }
  const filenames = (await readdir(directory)).filter((name) => name.endsWith('.pdf'))
    .sort((left, right) => left.localeCompare(right, 'en-GB', { numeric: true }));
  for (const filename of filenames) {
    const pdfPath = path.join(directory, filename);
    const [buffer, extracted, metadata] = await Promise.all([
      readFile(pdfPath),
      execFile('pdftotext', ['-layout', pdfPath, '-'], { maxBuffer: 8 * 1024 * 1024 }),
      execFile('pdfinfo', [pdfPath], { maxBuffer: 1024 * 1024 }),
    ]);
    let booking;
    try {
      booking = parseAirbnbBookingPdfText(extracted.stdout);
    } catch (error) {
      throw new Error(`${filename}: ${error instanceof Error ? error.message : error}`, { cause: error });
    }
    documents.push({
      relativePath: path.relative(repositoryDirectory, pdfPath),
      sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
      pageCount: pageCount(metadata.stdout, filename),
      booking,
      accessCodeCiphertext: booking.reservation.accessCode ? encryptAccessCode(booking.reservation.accessCode, key) : null,
      accessCodeKeyVersion: booking.reservation.accessCode ? Number(process.env.AIRBNB_IMPORT_ENCRYPTION_KEY_VERSION || 1) : null,
    });
  }
}
if (!documents.length) throw new Error('No Airbnb booking PDFs found.');
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');
const database = new Pool({ connectionString: databaseUrl, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined, max: 2 });
try {
  const snapshot = documents.map((item) => item.booking.source.capturedAt.slice(0, 10)).sort().at(-1)!;
  const result = await importAirbnbReservations({ sourceSnapshotOn: snapshot, documents }, database);
  console.log(`Airbnb booking import batch ${result.batchId} completed: ${result.documentsProcessed} documents processed, ${result.documentsAdded} documents added, ${result.reservationsAdded} reservations added, ${result.reservationsUnchanged} reservation captures matched.`);
} finally {
  await database.end();
}
