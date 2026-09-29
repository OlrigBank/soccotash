import http from 'node:http';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { createLocalFixtureDatabase } from './local-fixture-database.mjs';
import { importAirbnbReservations } from '../../site/src/lib/airbnb-import/reservations.ts';
import { getAirbnbReservationDetail } from '../../site/src/lib/airbnb-admin/repository.ts';
import { booking } from '../airbnb-capture/fixtures.mjs';
import { writeVerifiedPdf } from '../../site/scripts/capture-airbnb.mjs';
import { parseAirbnbBookingPdfText } from '../../site/src/lib/airbnb-import/booking-pdf.ts';
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

export async function startAirbnbPartialPreview(port = 8091) {
  const fixture = await createLocalFixtureDatabase('airbnb_partial_preview');
  for (const key of Object.keys(process.env)) {
    if (/^(BOOKING_|BOOKER_|STRIPE_|SMTP_|EMAIL_|RESEND_|TWILIO_|WHATSAPP_)/u.test(key)) delete process.env[key];
  }
  Object.assign(process.env, { DATABASE_SSL: 'false', ASTRO_NODE_AUTOSTART: 'disabled', WHATSAPP_DELIVERY_ENABLED: 'false' });
  let server;
  try {
    const admin = (await fixture.database.query("INSERT INTO admin_users(email,display_name,password_hash) VALUES('airbnb-preview@example.test','Disposable administrator','no-password-login') RETURNING id")).rows[0];
    const token = crypto.randomBytes(32).toString('hex');
    await fixture.database.query("INSERT INTO admin_sessions(admin_user_id,token_hash,expires_at) VALUES($1,$2,NOW()+INTERVAL '1 hour')", [admin.id, crypto.createHash('sha256').update(token).digest('hex')]);
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'airbnb-partial-preview-'));
    const browser = await chromium.launch({ headless: true });
    let parsed;
    try {
      const capture = structuredClone(booking);
      capture.conversation.groups[0].accessibleLabel = 'Unsupported synthetic message';
      const filename = path.join(directory, 'booking.pdf');
      await writeVerifiedPdf(await browser.newContext(), 'bookings', capture, filename);
      parsed = parseAirbnbBookingPdfText(execFileSync('pdftotext', ['-layout', filename, '-'], { encoding: 'utf8' }));
    } finally { await browser.close(); await fs.rm(directory, { recursive: true, force: true }); }
    const document = { relativePath: 'output/pdf/disposable-partial.pdf', sha256: crypto.createHash('sha256').update('disposable-partial').digest('hex'), pageCount: 3, booking: parsed, accessCodeCiphertext: null, accessCodeKeyVersion: null };
    const input = { sourceSnapshotOn: '2026-09-29', documents: [document] };
    const first = await importAirbnbReservations(input, fixture.database);
    const second = await importAirbnbReservations(input, fixture.database);
    assert.equal(first.reservationsAdded, 1);
    assert.equal(second.documentsAdded, 0);
    assert.equal(second.reservationsUnchanged, 1);
    const { public_id: reservationId } = (await fixture.database.query('SELECT public_id FROM airbnb_reservations')).rows[0];
    const detail = await getAirbnbReservationDetail(reservationId, fixture.database);
    assert.equal(detail.conversationIncomplete, true);
    assert.equal(detail.conversation.length, 0);
    assert.equal(detail.financialSummaries.length, 2);
    const conflicting = structuredClone(document);
    delete conflicting.booking.conversationCompleteness;
    conflicting.sha256 = crypto.createHash('sha256').update('conflicting-completeness').digest('hex');
    await assert.rejects(importAirbnbReservations({ ...input, documents: [conflicting] }, fixture.database), /conflicts/);
    const invalid = structuredClone(document);
    invalid.booking.financialSummaries[0].arithmeticStatus = 'discrepancy';
    await assert.rejects(importAirbnbReservations({ ...input, documents: [invalid] }, fixture.database), /verified finances/);
    console.log('Disposable database import, idempotency, warning query and conflict checks passed.');
    const { handler } = await import('../../site/dist/server/entry.mjs');
    server = http.createServer((request, response) => {
      if (request.url === '/__airbnb-preview/') {
        response.writeHead(303, { 'Set-Cookie': `olrig_admin_session=${token}; HttpOnly; SameSite=Lax; Path=/`, 'Cache-Control': 'no-store', Location: `/admin/airbnb/reservations/${reservationId}/` });
        response.end();
      } else handler(request, response);
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
    return { close: async () => { await new Promise(resolve => server.close(resolve)); await fixture.close(); } };
  } catch (error) { if (server) server.close(); await fixture.close(); throw error; }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const preview = await startAirbnbPartialPreview();
  console.log('Disposable Airbnb partial-booking preview: http://127.0.0.1:8091/__airbnb-preview/');
  const stop = async () => { await preview.close(); process.exit(0); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}
