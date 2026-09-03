#!/usr/bin/env node

import { execFile as execFileCallback } from 'node:child_process';
import crypto from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { parseReviewPdfText } from './generate-airbnb-review-datasets.mjs';
import { parseAirbnbBookingPdfText } from '../src/lib/airbnb-import/booking-pdf.ts';
import type { ParsedAirbnbReview } from '../src/lib/airbnb-import/reviews.ts';

const execFile = promisify(execFileCallback);
const repositoryDirectory = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const reviewDirectory = path.join(repositoryDirectory, 'output/pdf/airbnb-reviews');
const bookingDirectories = [
  path.join(repositoryDirectory, 'output/pdf/airbnb-message-bookings'),
  path.join(repositoryDirectory, 'output/pdf/airbnb-message-bookings-active-2026-09-01'),
];
const required = { documents: 155, reviews: 52, bookingDocuments: 103, conversations: 89, ratings: 312 };

function assertEqual(actual: number, expected: number, label: string): void {
  if (actual !== expected) throw new Error(`${label}: found ${actual}; reviewed baseline requires ${expected}`);
}

async function pdfFiles(directory: string): Promise<string[]> {
  return (await readdir(directory)).filter((name) => name.toLocaleLowerCase('en-GB').endsWith('.pdf'))
    .sort((left, right) => left.localeCompare(right, 'en-GB', { numeric: true }))
    .map((name) => path.join(directory, name));
}

async function extract(pdf: string): Promise<{ text: string; hash: string }> {
  const [buffer, text] = await Promise.all([
    readFile(pdf),
    execFile('pdftotext', ['-layout', pdf, '-'], { maxBuffer: 8 * 1024 * 1024 }),
  ]);
  return { text: text.stdout, hash: crypto.createHash('sha256').update(buffer).digest('hex') };
}

const reviewFiles = await pdfFiles(reviewDirectory);
const bookingFiles = (await Promise.all(bookingDirectories.map(pdfFiles))).flat();
const reviewIds = new Set<string>();
const conversationIds = new Set<string>();
const hashes = new Set<string>();
let ratingCount = 0;
for (const pdf of reviewFiles) {
  const source = await extract(pdf);
  const review = parseReviewPdfText(source.text, path.basename(pdf)) as ParsedAirbnbReview;
  if (reviewIds.has(review.source.reviewId)) throw new Error(`Duplicate review external ID ${review.source.reviewId}`);
  reviewIds.add(review.source.reviewId);
  hashes.add(source.hash);
  ratingCount += review.detailedRatings.length;
}
for (const pdf of bookingFiles) {
  const source = await extract(pdf);
  const booking = parseAirbnbBookingPdfText(source.text);
  conversationIds.add(booking.source.conversationId);
  hashes.add(source.hash);
}
const inventory = {
  documents: reviewFiles.length + bookingFiles.length,
  reviews: reviewIds.size,
  bookingDocuments: bookingFiles.length,
  conversations: conversationIds.size,
  ratings: ratingCount,
  uniqueHashes: hashes.size,
};
console.log(`Airbnb source inventory: ${inventory.documents} PDFs, ${inventory.reviews} reviews, ${inventory.bookingDocuments} booking captures, ${inventory.conversations} conversations, ${inventory.ratings} category ratings, ${inventory.uniqueHashes} unique hashes.`);
for (const [label, expected] of Object.entries(required)) assertEqual(inventory[label as keyof typeof required], expected, label);
assertEqual(inventory.uniqueHashes, inventory.documents, 'unique source hashes');

if (!process.argv.includes('--source-only')) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required unless --source-only is used.');
  const database = new pg.Pool({
    connectionString: databaseUrl,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    max: 2,
  });
  try {
    const counts = (await database.query<{
      documents: number; review_documents: number; booking_documents: number; reviews: number;
      reservations: number; reservation_documents: number; ratings: number; summaries: number;
      conversations: number; confirmed_links: number; proposed_links: number;
    }>(`SELECT
      (SELECT count(*)::int FROM airbnb_source_documents) documents,
      (SELECT count(*)::int FROM airbnb_source_documents WHERE document_type='review') review_documents,
      (SELECT count(*)::int FROM airbnb_source_documents WHERE document_type='booking') booking_documents,
      (SELECT count(*)::int FROM airbnb_reviews) reviews,
      (SELECT count(*)::int FROM airbnb_reservations) reservations,
      (SELECT count(*)::int FROM airbnb_reservation_documents) reservation_documents,
      (SELECT count(*)::int FROM airbnb_review_category_ratings) ratings,
      (SELECT count(*)::int FROM airbnb_financial_summaries) summaries,
      (SELECT count(*)::int FROM airbnb_conversation_entries) conversations,
      (SELECT count(*)::int FROM airbnb_review_reservation_links WHERE link_status='confirmed') confirmed_links,
      (SELECT count(*)::int FROM airbnb_review_reservation_links WHERE link_status='proposed') proposed_links`)).rows[0];
    assertEqual(counts.documents, required.documents, 'database source documents');
    assertEqual(counts.review_documents, required.reviews, 'database review documents');
    assertEqual(counts.booking_documents, required.bookingDocuments, 'database booking documents');
    assertEqual(counts.reviews, required.reviews, 'database reviews');
    assertEqual(counts.reservations, required.conversations, 'database reservations');
    assertEqual(counts.reservation_documents, required.bookingDocuments, 'reservation provenance links');
    assertEqual(counts.ratings, required.ratings, 'review category ratings');
    assertEqual(counts.summaries, required.conversations * 2, 'financial summaries');
    assertEqual(counts.confirmed_links, required.reviews, 'confirmed review links');
    const incomplete = (await database.query<{ count: number }>(`SELECT count(*)::int AS count FROM (
      SELECT review.id FROM airbnb_reviews review LEFT JOIN airbnb_review_category_ratings rating ON rating.review_id=review.id GROUP BY review.id HAVING count(rating.id)<>6
      UNION ALL
      SELECT reservation.id FROM airbnb_reservations reservation LEFT JOIN airbnb_financial_summaries summary ON summary.reservation_id=reservation.id GROUP BY reservation.id HAVING count(summary.id)<>2
      UNION ALL
      SELECT reservation.id FROM airbnb_reservations reservation LEFT JOIN airbnb_conversation_entries entry ON entry.reservation_id=reservation.id GROUP BY reservation.id HAVING count(entry.id)=0
    ) failures`)).rows[0].count;
    assertEqual(incomplete, 0, 'incomplete child-record groups');
    const databaseHashes = new Set((await database.query<{ sha256: string }>('SELECT sha256 FROM airbnb_source_documents')).rows.map((row) => row.sha256));
    assertEqual(databaseHashes.size, hashes.size, 'database source hashes');
    for (const hash of hashes) if (!databaseHashes.has(hash)) throw new Error('Database is missing a source-document hash.');
    console.log(`Airbnb database verification passed: ${counts.reviews} reviews, ${counts.reservations} reservations, ${counts.conversations} conversation entries, ${counts.summaries} financial summaries, ${counts.confirmed_links} confirmed and ${counts.proposed_links} proposed links.`);
  } finally {
    await database.end();
  }
}
