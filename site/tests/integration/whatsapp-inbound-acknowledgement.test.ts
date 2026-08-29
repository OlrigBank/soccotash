import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';

const { Pool } = pg;
const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;

test('inbound WhatsApp acknowledgements recognise bookings, suppress repeats and retain no content', async () => {
  assert.ok(databaseUrl, 'Set TEST_DATABASE_URL or DATABASE_URL to run the PostgreSQL integration test.');
  const schema = `whatsapp_inbound_${process.pid}_${crypto.randomBytes(6).toString('hex')}`;
  const control = new Pool({ connectionString: databaseUrl, max: 1 });
  const originalDatabase = process.env.DATABASE_URL;
  const originalEnvironment = { ...process.env };
  const originalFetch = globalThis.fetch;
  let application: pg.Pool | undefined;
  const sent: Array<{ to: string; body: string }> = [];
  try {
    await control.query(`CREATE SCHEMA ${quote(schema)}`);
    const url = new URL(databaseUrl);
    url.searchParams.set('options', `-c search_path=${schema},public`);
    process.env.DATABASE_URL = url.toString();
    const migrations = new Pool({ connectionString: url.toString(), max: 1 });
    try {
      const directory = new URL('../../db/', import.meta.url);
      for (const file of (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort()) {
        await migrations.query(await readFile(new URL(file, directory), 'utf8'));
      }
    } finally { await migrations.end(); }

    process.env.WHATSAPP_PROVIDER = 'meta';
    process.env.WHATSAPP_GRAPH_API_VERSION = 'v99.0';
    process.env.WHATSAPP_ACCESS_TOKEN = 'test-token';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '123456';
    process.env.WHATSAPP_DELIVERY_ENABLED = 'true';
    process.env.WHATSAPP_INBOUND_AUTO_REPLY_ENABLED = 'true';
    process.env.BOOKING_PUBLIC_URL = 'https://olrig.example';
    globalThis.fetch = async (_url, init) => {
      const payload = JSON.parse(String(init?.body || '{}'));
      sent.push({ to: payload.to, body: payload.text.body });
      return Response.json({ messages: [{ id: `wamid.reply.${sent.length}` }] });
    };

    const { getPool } = await import('../../src/lib/booking/db.ts');
    const { receiveWhatsAppInbound } = await import('../../src/lib/booking/whatsapp-inbound.ts');
    application = getPool();
    const booking = await application.query(
      `INSERT INTO provisional_bookings
         (property_id, arrival, departure, guests, guest_name, guest_email,
          guest_telephone, guest_telephone_e164, status)
       VALUES ('main-house', CURRENT_DATE + 20, CURRENT_DATE + 23, 2,
               'Inbound test', 'inbound@example.test', '07700 900123', '+447700900123', 'pending')
       RETURNING id::text`,
    );

    assert.equal(await receiveWhatsAppInbound({ providerMessageId: 'wamid.inbound.1', telephone: '447700900123' }), 'submitted');
    assert.equal(await receiveWhatsAppInbound({ providerMessageId: 'wamid.inbound.1', telephone: '447700900123' }), 'duplicate');
    assert.equal(await receiveWhatsAppInbound({ providerMessageId: 'wamid.inbound.2', telephone: '447700900123' }), 'suppressed');
    assert.equal(await receiveWhatsAppInbound({ providerMessageId: 'wamid.unknown', telephone: '447700900999' }), 'unknown');
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, '+447700900123');
    assert.match(sent[0].body, /incoming messages are not monitored/i);

    const records = await application.query(
      `SELECT provider_message_id, provisional_booking_id::text, recipient_masked,
              recipient_hash, status, response_message_id
         FROM whatsapp_inbound_acknowledgements ORDER BY id`,
    );
    assert.deepEqual(records.rows.map((row) => row.status), ['submitted', 'suppressed']);
    assert.ok(records.rows.every((row) => row.provisional_booking_id === booking.rows[0].id));
    assert.ok(records.rows.every((row) => row.recipient_masked === '+44***123'));
    assert.ok(records.rows.every((row) => /^[a-f0-9]{64}$/.test(row.recipient_hash)));
    const columns = await application.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'whatsapp_inbound_acknowledgements'`, [schema],
    );
    assert.doesNotMatch(columns.rows.map((row) => row.column_name).join(' '), /body|content|media|caption|telephone$/i);
  } finally {
    globalThis.fetch = originalFetch;
    process.env = originalEnvironment;
    process.env.DATABASE_URL = originalDatabase;
    if (application) await application.end();
    await control.query(`DROP SCHEMA IF EXISTS ${quote(schema)} CASCADE`);
    await control.end();
  }
});
