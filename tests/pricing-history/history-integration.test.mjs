import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createLocalFixtureDatabase } from '../support/local-fixture-database.mjs';
import { seedHistoryFixtures } from '../../site/tests/pricing/history-fixtures.ts';
import { defaultHistoryInput } from '../../site/src/lib/pricing/history.ts';
import { getHistoryReport, loadHistoryReservations } from '../../site/src/lib/pricing/history-repository.ts';
import { historyCsv } from '../../site/src/lib/pricing/history-csv.ts';

test('PostgreSQL history reads use an isolated read-only snapshot, minimise private data and never change prices', async () => {
  const fixture = await createLocalFixtureDatabase('pricing_history_integration');
  try {
    await seedHistoryFixtures(fixture.database);
    const before = (await fixture.database.query(`SELECT
      (SELECT count(*) FROM airbnb_reservations)::int AS reservations,
      (SELECT count(*) FROM pricing_plans)::int AS plans,
      (SELECT count(*) FROM pricing_rules)::int AS rules,
      (SELECT sum(total_minor)::text FROM airbnb_financial_summaries) AS total`)).rows[0];
    const now = new Date('2026-10-19T12:00:00Z');
    const input = defaultHistoryInput('main-house', now);
    let readOnlyChecks = 0;
    const checkedPool = { connect: async () => {
      const client = await fixture.database.connect();
      return {
        query: async (sql, values) => {
          if (sql.includes('SELECT jsonb_build_object')) {
            assert.equal((await client.query("SELECT current_setting('transaction_read_only') AS ro, current_setting('transaction_isolation') AS isolation")).rows[0].ro, 'on');
            assert.equal((await client.query("SELECT current_setting('transaction_isolation') AS isolation")).rows[0].isolation, 'repeatable read');
            readOnlyChecks++;
          }
          return client.query(sql, values);
        }, release: () => client.release(),
      };
    } };
    const report = await getHistoryReport(input, checkedPool, now);
    assert.equal(readOnlyChecks, 1);
    assert.equal(report.includedReservations, 18);
    assert.equal(report.profile.reduce((s, p) => s + p.reservations, 0), 24);
    assert.equal(report.rows.find(r => r.period === 'July' && r.dayType === 'Weekend').suggestedPence, 15000);
    assert.equal(report.fees.find(f => f.type === 'cleaning').totalPence, 18 * 3000);
    const second = await getHistoryReport(input, fixture.database, now);
    assert.deepEqual(second, report);
    const cli = await promisify(execFile)(process.execPath, ['--experimental-strip-types', 'site/scripts/pricing-history-report.ts', '--from', '2023-01-01', '--to', '2025-12-31', '--format', 'profile']);
    const profile = JSON.parse(cli.stdout);
    assert.equal(profile.includedReservations, 18);
    assert.equal(profile.profile.reduce((sum, p) => sum + p.reservations, 0), 24);
    const records = await loadHistoryReservations(input, fixture.database);
    assert.equal(records.length, 24);
    for (const text of [JSON.stringify(records), JSON.stringify(report), historyCsv(report)]) {
      assert.ok(!text.includes('PRIVATE_FIXTURE_GUEST'));
      assert.ok(!text.includes('PRIVATE_FIXTURE_FINANCIAL'));
      assert.ok(!text.includes('PRIVATE_FIXTURE_RAW_LINE'));
      assert.ok(!text.includes('booker_display_name'));
    }
    const cottage = await getHistoryReport({ ...input, propertyId: 'cottage' }, fixture.database, now);
    assert.equal(cottage.includedReservations, 1);
    assert.ok(cottage.rows.every(r => r.suggestedPence === null));
    const after = (await fixture.database.query(`SELECT
      (SELECT count(*) FROM airbnb_reservations)::int AS reservations,
      (SELECT count(*) FROM pricing_plans)::int AS plans,
      (SELECT count(*) FROM pricing_rules)::int AS rules,
      (SELECT sum(total_minor)::text FROM airbnb_financial_summaries) AS total`)).rows[0];
    assert.deepEqual(after, before);
  } finally { await fixture.close(); }
});
