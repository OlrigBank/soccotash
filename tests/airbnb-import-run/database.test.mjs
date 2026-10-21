import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFile, readdir, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { createLocalFixtureDatabase } from '../support/local-fixture-database.mjs';
import { booking, reviewText } from '../airbnb-capture/fixtures.mjs';
import { parseReviewDialog } from '../../site/scripts/airbnb-capture/records.mjs';
import { writeVerifiedPdf } from '../../site/scripts/capture-airbnb.mjs';
import { loadReviewDocuments } from '../../site/scripts/import-airbnb-reviews.ts';
import { loadBookingDocuments } from '../../site/scripts/import-airbnb-message-bookings.ts';
import { importAirbnbReservations } from '../../site/src/lib/airbnb-import/reservations.ts';
import { checkMigrations, counts, inspectDocuments, executeImport } from '../../site/scripts/import-airbnb-run.mjs';

test('real PDFs, read-only preflight, imports, reruns, conflicts and partial completion', { timeout: 90000 }, async () => {
  const fixture = await createLocalFixtureDatabase('airbnb_guided');
  const run = `guided-test-${process.pid}`;
  const directory = path.resolve('output/pdf/airbnb-terminal', run);
  const rawDirectory = path.resolve('.airbnb-capture/runs', run);
  let browser;
  try {
    const db = fixture.database;
    await db.query('CREATE TABLE schema_migrations(filename text PRIMARY KEY,checksum text)');
    await assert.rejects(checkMigrations(db), /migration/);
    for (const filename of (await readdir('site/db')).filter(n => n.endsWith('.sql'))) {
      await db.query('INSERT INTO schema_migrations VALUES($1,$2)', [filename, createHash('sha256').update(await readFile(path.join('site/db', filename))).digest('hex')]);
    }
    await checkMigrations(db);
    await mkdir(path.join(directory, 'reviews'), { recursive: true });
    await mkdir(path.join(directory, 'bookings'), { recursive: true });
    await mkdir(path.join(rawDirectory, 'bookings'), { recursive: true });
    browser = await chromium.launch();
    const context = await browser.newContext();
    const review = parseReviewDialog({ text: reviewText, reviewId: '9000000001', capturedAt: '2026-09-01T12:00:00Z' });
    // Match the synthetic booking so reconciliation has a genuine candidate.
    review.stay = { checkIn: '2026-10-24', checkOut: '2026-10-26', nights: 2, yearSource: 'displayed' };
    const capture = structuredClone(booking);
    capture.conversation.groups[0].accessibleLabel = 'Unsupported synthetic message';
    await writeVerifiedPdf(context, 'reviews', { review }, path.join(directory, 'reviews/9000000001.pdf'));
    await writeVerifiedPdf(context, 'bookings', capture, path.join(directory, 'bookings/8000000001.pdf'));
    await assert.rejects(loadBookingDocuments([path.join(directory, 'bookings')], Buffer.alloc(32)), /ENOENT/);
    await writeFile(path.join(rawDirectory, 'bookings/8000000001.json'), JSON.stringify(capture));
    const groups = { reviews: await loadReviewDocuments(path.join(directory, 'reviews')), bookings: await loadBookingDocuments([path.join(directory, 'bookings')], Buffer.alloc(32)) };
    const before = await counts(db);
    const client = await db.connect();
    try {
      await client.query('BEGIN READ ONLY');
      assert.deepEqual(await inspectDocuments(client, groups), { selected: 2, existing: 0 });
      await client.query('ROLLBACK');
    } finally { client.release(); }
    assert.deepEqual(await counts(db), before);
    const report = { completed: [] };
    await executeImport(db, groups, report, () => {});
    assert.equal(report.status, 'completed');
    assert.equal(report.reconciliation.linksAdded, 1);
    assert.equal(report.completed.length, 3);
    const after = await counts(db);
    await executeImport(db, groups, { completed: [] }, () => {});
    for (const kind of ['reviews', 'bookings']) {
      await executeImport(db, { [kind]: groups[kind] }, { completed: [] }, () => {});
    }
    assert.deepEqual(await counts(db), after);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM airbnb_review_publications')).rows[0].count, 0);
    assert.deepEqual(await inspectDocuments(db, groups, true), { selected: 2, existing: 2 });
    const conflict = structuredClone(groups);
    conflict.reviews[0].review.publicReview.text = 'Conflicting synthetic text';
    await inspectDocuments(db, conflict);
    await executeImport(db, { reviews: conflict.reviews }, { completed: [] }, () => {});
    assert.equal((await db.query('SELECT public_text FROM airbnb_reviews')).rows[0].public_text, groups.reviews[0].review.publicReview.text);
    const financialConflict = structuredClone(groups);
    financialConflict.bookings[0].booking.financialSummaries[0].totalMinor++;
    await assert.rejects(inspectDocuments(db, financialConflict), /different parsed content/);
    const failedReport = { completed: [] };
    await assert.rejects(executeImport(db, financialConflict, failedReport, () => {}));
    assert.equal(failedReport.stage, 'bookings');
    assert.deepEqual(failedReport.completed.map(s => s.step), ['reviews']);
    assert.deepEqual(await counts(db), after);

    const admin = (await db.query("INSERT INTO admin_users(email,display_name,password_hash) VALUES('update-fixture@example.test','Update fixture','no-login') RETURNING id")).rows[0].id;
    await db.query("UPDATE airbnb_review_reservation_links SET decision_source='manual',reviewed_by_admin_user_id=$1",[admin]);
    const manualLinks = (await db.query('SELECT * FROM airbnb_review_reservation_links')).rows;
    // A complete newer capture can add messages and private information.
    const newer = structuredClone(groups.bookings[0]);
    newer.relativePath = 'output/pdf/synthetic-update-one.pdf';
    newer.sha256 = createHash('sha256').update('update-one').digest('hex');
    newer.booking.source.capturedAt = '2026-10-01T12:00:00Z';
    delete newer.booking.conversationCompleteness;
    newer.booking.reservation.hostNotes = 'Synthetic retained note';
    newer.booking.reservation.accessCode = 'synthetic-code';
    newer.accessCodeCiphertext = Buffer.from('synthetic-encrypted-code');
    newer.accessCodeKeyVersion = 1;
    newer.booking.conversationEntries = [1,2].map(n => ({position:n-1,entryType:'message',senderType:'guest',senderDisplayName:'Example Guest',body:`Synthetic message ${n}`,displayedDate:'1 October 2026',displayedTime:`12:0${n}`,sentAt:`2026-10-01T12:0${n}:00Z`,timestampPrecision:'exact',reactions:[]}));
    const importOne = d => importAirbnbReservations({sourceSnapshotOn:'2026-10-20',documents:[d]},db);
    assert.equal((await importOne(newer)).reservationsUpdated, 1);
    const incomplete = structuredClone(newer);
    incomplete.relativePath = 'output/pdf/synthetic-update-two.pdf';
    incomplete.sha256 = createHash('sha256').update('update-two').digest('hex');
    incomplete.booking.source.capturedAt = '2026-10-20T12:00:00Z';
    incomplete.booking.reservation.bookingDate = '2026-08-06';
    incomplete.booking.reservation.children = 0;
    incomplete.booking.reservation.hostNotes = null;
    incomplete.booking.reservation.accessCode = null;
    incomplete.accessCodeCiphertext = null;
    incomplete.accessCodeKeyVersion = null;
    incomplete.booking.conversationEntries = [];
    incomplete.booking.conversationCompleteness = groups.bookings[0].booking.conversationCompleteness;
    const host = incomplete.booking.financialSummaries.find(s=>s.perspective==='host_earnings');
    host.totalMinor += 100;
    host.lineItems.find(l=>l.itemType==='accommodation').amountMinor += 100;
    const totalLine = host.lineItems.find(l=>l.itemType==='total');
    if(totalLine) totalLine.amountMinor += 100;
    incomplete.booking.reservation.headlineHostTotalMinor = host.totalMinor;
    await inspectDocuments(db, {bookings:[incomplete]});
    assert.equal((await importOne(incomplete)).reservationsUpdated, 1);
    const row = (await db.query('SELECT booking_date::text,children FROM airbnb_reservations')).rows[0];
    assert.equal(row.booking_date,'2026-08-06'); assert.equal(row.children,0);
    const privateRow = (await db.query('SELECT host_notes,access_code_ciphertext FROM airbnb_reservation_private_details')).rows[0];
    assert.equal(privateRow.host_notes,'Synthetic retained note');
    assert.deepEqual(privateRow.access_code_ciphertext,Buffer.from('synthetic-encrypted-code'));
    assert.equal((await db.query('SELECT count(*)::int AS n FROM airbnb_conversation_entries')).rows[0].n,2);
    assert.equal(Number((await db.query("SELECT total_minor FROM airbnb_financial_summaries WHERE perspective='host_earnings'")).rows[0].total_minor),host.totalMinor);
    assert.equal((await importOne(incomplete)).reservationsUpdated,0);
    assert.equal((await importOne(newer)).reservationsUpdated,0);
    assert.equal((await db.query('SELECT children FROM airbnb_reservations')).rows[0].children,0);
    // Later full capture overlaps the old messages and contains one new entry.
    const complete = structuredClone(newer);
    complete.sha256 = createHash('sha256').update('update-three').digest('hex');
    complete.relativePath = 'output/pdf/synthetic-update-three.pdf';
    complete.booking.source.capturedAt = '2026-10-21T12:00:00Z';
    complete.booking.conversationEntries.push({...complete.booking.conversationEntries[1],position:2,body:'Synthetic message 3',sentAt:'2026-10-21T11:00:00Z'});
    complete.booking.financialSummaries.forEach(s=>s.arithmeticStatus='not_determinable');
    await importOne(complete);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM airbnb_conversation_entries')).rows[0].n,3);
    assert.equal(Number((await db.query("SELECT total_minor FROM airbnb_financial_summaries WHERE perspective='host_earnings'")).rows[0].total_minor),host.totalMinor);
    assert.equal((await db.query('SELECT children FROM airbnb_reservations')).rows[0].children,0);
    // Published snapshots and all review columns survive a changed recapture.
    const reviewId = (await db.query('SELECT id FROM airbnb_reviews')).rows[0].id;
    await db.query(`INSERT INTO airbnb_review_publications(review_id,published,public_review,category_scores) VALUES($1,TRUE,'{"text":"Approved snapshot"}','[5,5,5,5,5,5]')`,[reviewId]);
    const savedReview = (await db.query('SELECT * FROM airbnb_reviews')).rows;
    const savedPublication = (await db.query('SELECT * FROM airbnb_review_publications')).rows;
    await executeImport(db,{reviews:conflict.reviews},{completed:[]},()=>{});
    assert.deepEqual((await db.query('SELECT * FROM airbnb_reviews')).rows,savedReview);
    assert.deepEqual((await db.query('SELECT * FROM airbnb_review_publications')).rows,savedPublication);
    assert.deepEqual((await db.query('SELECT * FROM airbnb_review_reservation_links')).rows,manualLinks);
  } finally {
    await browser?.close();
    await fixture.close();
    await rm(directory, { recursive: true, force: true });
    await rm(rawDirectory, { recursive: true, force: true });
  }
});
