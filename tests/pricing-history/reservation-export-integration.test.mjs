import assert from 'node:assert/strict';
import test from 'node:test';
import { createLocalFixtureDatabase } from '../support/local-fixture-database.mjs';
import { seedHistoryFixtures } from '../../site/tests/pricing/history-fixtures.ts';
import { loadReservationExport } from '../../site/src/lib/pricing/reservation-export-repository.ts';
import { buildReservationArchive } from '../../site/src/lib/pricing/reservation-export.ts';
import { ReservationExportLimitError } from '../../site/src/lib/pricing/reservation-export-types.ts';
import { parseExportCsv, readReservationArchive } from '../../site/tests/pricing/reservation-export-fixtures.ts';

test('source export retains all imported records and exact SQL fields in a read-only snapshot', async () => {
  const fixture = await createLocalFixtureDatabase('reservation_evidence_integration');
  try {
    await seedHistoryFixtures(fixture.database);
    const first = (await fixture.database.query('SELECT id FROM airbnb_reservations ORDER BY id LIMIT 1')).rows[0].id;
    await fixture.database.query(`UPDATE airbnb_reservations SET booking_date='2023-06-15',adults=2,children=0,infants=0,pets=1,
      party_size=2,check_in_time='16:00',check_out_time='10:00',headline_host_total_minor=90071992547409931 WHERE id=$1`, [first]);
    const financial = (await fixture.database.query("SELECT id FROM airbnb_financial_summaries WHERE reservation_id=$1 AND perspective='guest_paid'", [first])).rows[0].id;
    await fixture.database.query(`UPDATE airbnb_financial_line_items SET quantity=2.5000,unit_amount_minor=-90071992547409931,
      raw_display_text=$1 WHERE financial_summary_id=$2 AND position=0`, ['Original "quote", £\n-£9.00', financial]);
    for (const [i, status] of ['Cancelled', null].entries()) {
      const r = await fixture.database.query(`INSERT INTO airbnb_reservations
        (conversation_id,property_id,source_listing_name,booker_display_name,arrival,departure,nights,source_status_text,cancellation_policy,currency,source_captured_at)
        VALUES ($1,NULL,'=UNTRUSTED_LISTING','NEVER_EXPORT_GUEST','2027-01-01','2027-01-03',2,$2,'Flexible','GBP',NOW()) RETURNING id`, [`989999${i}`, status]);
      if (i === 1) await fixture.database.query(`INSERT INTO airbnb_financial_summaries
        (reservation_id,perspective,currency,total_minor,arithmetic_status,raw_display_text,captured_at)
        VALUES ($1,'host_earnings','GBP',0,'not_determinable','Original panel without detailed lines',NOW())`, [r.rows[0].id]);
    }
    const fingerprint = async () => (await fixture.database.query(`SELECT
      (SELECT count(*)::int FROM airbnb_reservations) AS reservations,
      (SELECT count(*)::int FROM airbnb_financial_line_items) AS lines,
      (SELECT sum(amount_minor)::text FROM airbnb_financial_line_items) AS amounts,
      (SELECT count(*)::int FROM pricing_plans) AS plans,
      (SELECT count(*)::int FROM pricing_rules) AS rules`)).rows[0];
    const before = await fingerprint();
    let verifiedSnapshot = false, batches = 0;
    const pool = { connect: async () => {
      const client = await fixture.database.connect();
      return { release: () => client.release(), query: async (sql, values) => {
        if (sql.startsWith('FETCH ')) batches++;
        if (sql.includes('SELECT jsonb_build_object')) {
          const state = (await client.query("SELECT current_setting('transaction_read_only') AS ro, current_setting('transaction_isolation') AS isolation")).rows[0];
          assert.equal(state.ro, 'on'); assert.equal(state.isolation, 'repeatable read'); verifiedSnapshot = true;
        }
        return client.query(sql, values);
      } };
    } };
    const source = await loadReservationExport(pool);
    assert.ok(verifiedSnapshot); assert.equal(source.length, 26);
    assert.ok(!JSON.stringify(source).includes('NEVER_EXPORT_GUEST'));
    assert.ok(!JSON.stringify(source).includes('PRIVATE_FIXTURE_GUEST'));
    const result = buildReservationArchive(source, new Date('2026-10-19T12:00:00Z'), ['main-house', 'cottage']);
    const files = readReservationArchive(result.archive);
    assert.equal(Object.keys(files).length, source.length + 3);
    const index = parseExportCsv(files['reservations.csv']);
    const lines = parseExportCsv(files['financial-lines.csv']);
    assert.equal(index.length, before.reservations);
    assert.equal(lines.filter(l => l.row_kind === 'financial_line').length, before.lines);
    assert.equal(result.financialLineCount, before.lines);
    assert.ok(lines.some(l => l.row_kind === 'summary_only'));
    assert.ok(lines.some(l => l.row_kind === 'reservation_only'));
    assert.ok(lines.some(l => l.unit_amount_minor === '-90071992547409931' && l.unit_amount_decimal === '-900719925474099.31' && l.quantity === '2.5000'));
    assert.ok(lines.some(l => l.line_raw_display_text === 'Original "quote", £\n-£9.00'));
    assert.ok(index.some(r => r.headline_host_total_minor === '90071992547409931'));
    assert.equal(index.filter(r => r.stay_phase === 'future').length, 2);
    assert.ok(index.some(r => r.source_status_text === 'Cancelled'));
    assert.ok(index.some(r => r.source_status_text === ''));
    const individual = index.flatMap(r => parseExportCsv(files[`reservations/${r.reservation_id}.csv`]));
    assert.deepEqual(individual, lines);
    for (const r of source) for (const p of r.panels) {
      const exported = lines.filter(l => l.financial_summary_id === `summary_${p.id}`);
      assert.equal(exported.filter(l => l.panel_raw_display_text).length, 1);
      assert.equal(exported[0].panel_total_minor, p.total_minor);
      if (p.lines.length) {
        const sum = exported.filter(l => l.contributes_to_panel_total === 'true').reduce((s, l) => s + BigInt(l.amount_minor), 0n);
        assert.equal(sum.toString(), exported[0].calculated_panel_total_minor);
      }
    }
    assert.deepEqual(await loadReservationExport(fixture.database), source);
    assert.deepEqual(await fingerprint(), before);
    await fixture.database.query(`INSERT INTO airbnb_reservations
      (conversation_id,source_listing_name,booker_display_name,arrival,departure,nights,cancellation_policy,currency,source_captured_at)
      SELECT '989980' || n::text,'Disposable batch listing','NEVER_EXPORT_BATCH_GUEST','2024-01-01','2024-01-03',2,'Flexible','GBP',NOW()
      FROM generate_series(1,101) AS g(n)`);
    const previousBatches = batches;
    assert.equal((await loadReservationExport(pool)).length, 127);
    assert.equal(batches - previousBatches, 2);
    const emptyPool = { connect: async () => ({ release() {}, query: async sql => sql.includes('count(*)') ? { rows: [{ count: 0 }] } : { rows: [] } }) };
    assert.deepEqual(await loadReservationExport(emptyPool), []);
  } finally { await fixture.close(); }
});

test('a reservation-limit failure rolls the source transaction back and releases its connection', async () => {
  const queries = []; let released = false;
  const pool = { connect: async () => ({ release: () => { released = true; }, query: async sql => { queries.push(sql); return { rows: [{ count: 50_001 }] }; } }) };
  await assert.rejects(loadReservationExport(pool), ReservationExportLimitError);
  assert.equal(queries.at(-1), 'ROLLBACK'); assert.ok(released);
});
