#!/usr/bin/env node

import pg from 'pg';
import { reconcileAirbnbReviews } from '../src/lib/airbnb-import/reconciliation.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');
const database = new pg.Pool({
  connectionString: databaseUrl,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  max: 2,
});
try {
  const result = await reconcileAirbnbReviews(database);
  console.log(`Airbnb reconciliation completed: ${result.reviewsConsidered} reviews considered, ${result.candidatesFound} candidates found, ${result.linksAdded} links added, ${result.automaticallyConfirmed} automatically confirmed, ${result.proposed} proposed, ${result.manualDecisionsPreserved} manual decisions preserved.`);
} finally {
  await database.end();
}
