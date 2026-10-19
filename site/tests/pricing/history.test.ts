import assert from 'node:assert/strict';
import test from 'node:test';
import { analyseHistory, defaultHistoryInput, historyStatistics, normaliseHistoryReservation, parseHistoryInput } from '../../src/lib/pricing/history.ts';
import { historyCsv } from '../../src/lib/pricing/history-csv.ts';
import { historyReportHtml } from '../../src/lib/pricing/history-client.ts';
import { historyFixtures, reservationFixture } from './history-fixtures.ts';

const now = new Date('2026-10-19T12:00:00Z');
const input = () => defaultHistoryInput('main-house', now);

test('defaults use the three completed calendar years and validate bounded settings', () => {
  assert.deepEqual(input(), { propertyId: 'main-house', startDate: '2023-01-01', endDate: '2025-12-31', targetYear: 2027, upliftPercent: 0, exceptions: [] });
  assert.deepEqual(parseHistoryInput(input(), ['main-house'], now), input());
  for (const change of [{ startDate: '2024-02-30' }, { endDate: '2026-10-19' }, { startDate: '2025-12-31', endDate: '2024-01-01' }, { targetYear: 2025 }, { upliftPercent: NaN }, { upliftPercent: 501 }, { propertyId: 'unknown' }, { exceptions: null }]) {
    assert.throws(() => parseHistoryInput({ ...input(), ...change }, ['main-house'], now));
  }
});

test('host nightly evidence enriches matching guest accommodation without double counting fees or parents', () => {
  const result = normaliseHistoryReservation(reservationFixture());
  assert.notEqual(typeof result, 'string');
  if (typeof result === 'string') return;
  assert.equal(result.nights.length, 7);
  assert.equal(result.nights.reduce((s, n) => s + n.amountPence, 0), 80000);
  assert.ok(result.nights.every(n => !n.estimated));
  assert.deepEqual(result.fees.map(f => f.type).sort(), ['cleaning', 'guest_service_fee', 'tax']);
  assert.equal(result.nights.find(n => n.date === '2024-07-05')!.amountPence, 15000);
});

test('missing guest panel falls back to a verified host accommodation panel, never payout', () => {
  const r = reservationFixture(); r.financials = [r.financials[1]];
  const result = normaliseHistoryReservation(r);
  assert.notEqual(typeof result, 'string');
  if (typeof result === 'string') return;
  assert.equal(result.nights.reduce((s, n) => s + n.amountPence, 0), 80000);
  assert.deepEqual(result.fees, [{ type: 'host_service_fee', amountPence: -2500 }]);
});

test('whole-stay discounts allocate every penny and remain estimated across a year boundary', () => {
  const r = reservationFixture('pennies', '2024-12-30', 3, false);
  r.financials = [r.financials[0]];
  const f = r.financials[0];
  f.lines.push({ id: 'discount', parentId: null, type: 'adjustment', description: 'Nightly rate adjustment', serviceDate: null, amountPence: -100 });
  f.totalPence -= 100;
  f.lines.find(l => l.type === 'total')!.amountPence -= 100;
  const result = normaliseHistoryReservation(r);
  assert.notEqual(typeof result, 'string');
  if (typeof result === 'string') return;
  assert.deepEqual(result.nights.map(n => n.amountPence), [9967, 9967, 9966]);
  assert.deepEqual(result.nights.map(n => n.date), ['2024-12-30', '2024-12-31', '2025-01-01']);
  assert.ok(result.nights.every(n => n.estimated));
});

test('dated discount children reconcile with net nightly prices', () => {
  const r = reservationFixture(); r.financials = [r.financials[1]];
  const f = r.financials[0];
  f.lines.push({ id: 'discount', parentId: null, type: 'adjustment', description: 'Nightly rate adjustment', serviceDate: null, amountPence: -700 });
  for (let i = 0; i < 7; i++) f.lines.push({ id: `discount-${i}`, parentId: 'discount', type: 'adjustment', description: 'Non-refundable option', serviceDate: `2024-07-0${i + 1}`, amountPence: -100 });
  f.totalPence -= 700; f.lines.find(l => l.type === 'total')!.amountPence -= 700;
  const result = normaliseHistoryReservation(r);
  assert.notEqual(typeof result, 'string');
  if (typeof result === 'string') return;
  assert.equal(result.nights[0].amountPence, 9900);
  assert.ok(result.nights.every(n => !n.estimated));
});

test('recognised guest-quality and early-booking discounts reconcile without changing stored lines', () => {
  for (const description of ['Top-rated guests discount', 'Early bird discount']) {
    const r = reservationFixture(); r.financials = [r.financials[1]];
    const f = r.financials[0];
    f.lines.push({ id: 'discount', parentId: null, type: 'adjustment', description, serviceDate: null, amountPence: -700 });
    for (let i = 0; i < 7; i++) f.lines.push({ id: `discount-${i}`, parentId: 'discount', type: 'adjustment', description: description.replace('guests', 'guest'), serviceDate: `2024-07-0${i + 1}`, amountPence: -100 });
    f.totalPence -= 700; f.lines.find(l => l.type === 'total')!.amountPence -= 700;
    const before = JSON.stringify(r);
    const result = normaliseHistoryReservation(r);
    assert.notEqual(typeof result, 'string');
    if (typeof result === 'string') continue;
    assert.equal(result.nights[0].amountPence, 9900);
    assert.ok(result.nights.every(n => !n.estimated));
    assert.equal(JSON.stringify(r), before);
    f.lines.find(l => l.parentId === 'discount')!.description = 'Unspecified adjustment';
    assert.equal(normaliseHistoryReservation(r), 'Nightly breakdown discrepancy');
  }
});

test('explicit accommodation labels support a verified aggregate; generic stay totals remain ambiguous', () => {
  const r = reservationFixture();
  r.financials[0].lines[0].type = 'other'; r.financials[0].lines[0].description = 'Accommodation';
  r.financials[1].lines = r.financials[1].lines.filter(l => l.parentId === null);
  r.financials[1].lines[0].type = 'other'; r.financials[1].lines[0].description = 'Total Stay Price';
  const result = normaliseHistoryReservation(r);
  assert.notEqual(typeof result, 'string');
  if (typeof result === 'string') return;
  assert.equal(result.nights.reduce((sum, n) => sum + n.amountPence, 0), 80000);
  assert.ok(result.nights.every(n => n.estimated));
  r.financials = [r.financials[1]];
  assert.equal(normaliseHistoryReservation(r), 'Missing accommodation charges');
});

test('different discounts on the same night stack, while duplicated discount evidence is rejected', () => {
  const r = reservationFixture(); r.financials = [r.financials[1]];
  const f = r.financials[0];
  f.lines.push({ id: 'discount', type: 'adjustment', amountPence: -2100, description: 'Nightly rate adjustment', parentId: null, serviceDate: null });
  for (let i = 0; i < 7; i++) {
    f.lines.push({ id: `non-refundable-${i}`, type: 'adjustment', amountPence: -100, description: 'Non-refundable option', parentId: 'discount', serviceDate: `2024-07-0${i + 1}` });
    f.lines.push({ id: `weekly-${i}`, type: 'adjustment', amountPence: -200, description: 'Weekly discount', parentId: 'discount', serviceDate: `2024-07-0${i + 1}` });
  }
  f.totalPence -= 2100; f.lines.find(l => l.type === 'total')!.amountPence -= 2100;
  const result = normaliseHistoryReservation(r);
  assert.notEqual(typeof result, 'string');
  if (typeof result === 'string') return;
  assert.equal(result.nights[0].amountPence, 9700);
  assert.equal(result.nights[4].amountPence, 14700);
  f.lines.find(l => l.id === 'weekly-0')!.description = 'Non-refundable option';
  assert.equal(normaliseHistoryReservation(r), 'Nightly breakdown discrepancy');
});

test('conflicting perspectives, incomplete children and ambiguous adjustments cannot recommend rates', () => {
  const conflict = reservationFixture();
  conflict.financials[0].lines[0].amountPence += 100;
  conflict.financials[0].totalPence += 100;
  conflict.financials[0].lines.find(l => l.type === 'total')!.amountPence += 100;
  assert.equal(normaliseHistoryReservation(conflict), 'Conflicting accommodation figures');
  const incomplete = reservationFixture(); incomplete.financials[1].lines.splice(1, 1);
  assert.match(String(normaliseHistoryReservation(incomplete)), /breakdown discrepancy/);
  const ambiguous = reservationFixture(); ambiguous.financials[0].lines[1].type = 'adjustment'; ambiguous.financials[0].lines[1].description = 'Special adjustment';
  assert.match(String(normaliseHistoryReservation(ambiguous)), /Ambiguous/);
  const discrepancy = reservationFixture(); discrepancy.financials[1].arithmeticStatus = 'discrepancy';
  assert.equal(normaliseHistoryReservation(discrepancy), 'Financial reconciliation discrepancy');
});

test('leap days are allocated and departures are excluded', () => {
  const result = normaliseHistoryReservation(reservationFixture('leap', '2024-02-28', 3));
  assert.notEqual(typeof result, 'string');
  if (typeof result === 'string') return;
  assert.deepEqual(result.nights.map(n => n.date), ['2024-02-28', '2024-02-29', '2024-03-01']);
});

test('supported weekday/weekend evidence and monthly fallback are distinguished', () => {
  const report = analyseHistory(historyFixtures(), input(), now);
  const july = report.rows.filter(r => r.period === 'July');
  assert.deepEqual(july.map(r => r.suggestedPence), [10000, 15000]);
  assert.ok(july.every(r => r.evidence === 'Supported historical baseline'));
  const august = report.rows.filter(r => r.period === 'August');
  assert.equal(august[0].suggestedPence, august[1].suggestedPence);
  assert.ok(august.every(r => r.evidence === 'Monthly baseline fallback' && r.statistics.estimatedPercent === 100 && r.statistics.nights === 24));
  assert.equal(report.rows[0].suggestedPence, null);
  assert.equal(report.includedReservations, 18);
  assert.equal(report.consideredReservations, 22);
  assert.deepEqual(report.exclusions, { 'Cancelled or unknown status': 2, 'Missing financial summaries': 1, 'Non-GBP currency': 1 });
  assert.ok(report.profile.some(p => p.propertyId === 'Unmapped'));
});

test('threshold requires independent reservations and two years, with interpolated percentiles', () => {
  const nights = Array.from({ length: 20 }, (_, i) => ({ reservationId: 'one', date: `2024-01-${String(i + 1).padStart(2, '0')}`, amountPence: (i + 1) * 100, estimated: false }));
  const s = historyStatistics(nights);
  assert.equal(s.supported, false);
  assert.equal(s.medianPence, 1050);
  assert.equal(s.lowerPence, 575);
  assert.equal(s.upperPence, 1525);
  assert.equal(historyStatistics(nights.map((n, i) => ({ ...n, reservationId: String(i) }))).supported, false);
  assert.equal(historyStatistics(nights.map((n, i) => ({ ...n, reservationId: String(i), date: `${i < 10 ? 2023 : 2024}${n.date.slice(4)}` }))).supported, true);
});

test('exceptions remove ordinary samples, reject overlaps and leave unsupported premiums blank', () => {
  const settings = input();
  settings.exceptions = [{ name: 'Summer event', target: { start: '2027-07-01', end: '2027-07-07' }, historical: [{ start: '2023-07-01', end: '2023-07-07' }, { start: '2024-07-01', end: '2024-07-07' }, { start: '2025-07-01', end: '2025-07-07' }] }];
  assert.deepEqual(parseHistoryInput(settings, ['main-house'], now), settings);
  const report = analyseHistory(historyFixtures(), settings, now);
  const exception = report.rows.at(-1)!;
  assert.equal(exception.statistics.reservations, 3);
  assert.equal(exception.suggestedPence, null);
  assert.ok(exception.referencePence !== null);
  assert.equal(report.rows.filter(r => r.period === 'July')[0].statistics.reservations, 9);
  assert.throws(() => parseHistoryInput({ ...settings, exceptions: [settings.exceptions[0], { ...settings.exceptions[0], name: 'Clash' }] }, ['main-house'], now), /overlap/);
  assert.throws(() => parseHistoryInput({ ...settings, exceptions: [{ ...settings.exceptions[0], historical: [] }] }, ['main-house'], now), /historical periods/);
});

test('range clipping, uplift rounding and ended-stay checks are deterministic', () => {
  const report = analyseHistory(historyFixtures(), { ...input(), upliftPercent: 7.5 }, now);
  assert.equal(report.rows.find(r => r.period === 'July' && r.dayType === 'Weekend')!.suggestedPence, 16100);
  const halfPound = analyseHistory(historyFixtures(), { ...input(), upliftPercent: 15 }, now);
  assert.equal(halfPound.rows.find(r => r.period === 'July' && r.dayType === 'Weekend')!.suggestedPence, 17300);
  const clipped = analyseHistory([reservationFixture('clip', '2024-12-30', 3)], { ...input(), startDate: '2024-12-31', endDate: '2024-12-31' }, now);
  assert.equal(clipped.yearly[0].statistics.nights, 1);
  const future = analyseHistory([reservationFixture('future', '2026-10-18', 7)], { ...input(), endDate: '2026-10-18' }, now);
  assert.equal(future.exclusions['Stay has not ended'], 1);
});

test('CSV and rendered report carry the same rates, provenance and safe exception text', () => {
  const settings = input(); settings.exceptions = [{ name: '=1+1<script>', target: { start: '2027-12-25', end: '2027-12-26' }, historical: [{ start: '2024-12-25', end: '2024-12-26' }] }];
  const report = analyseHistory(historyFixtures(), settings, now);
  const csv = historyCsv(report);
  assert.ok(csv.includes('"150.00"'));
  assert.ok(csv.includes(report.calculatedAt));
  assert.ok(csv.includes('"\'=1+1<script>"'));
  assert.ok(!JSON.stringify(report).includes('PRIVATE_FIXTURE'));
  const html = historyReportHtml(report, '<img src=x>');
  assert.ok(html.includes('£150.00'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<img src=x>'));
  assert.ok(html.includes('Monthly baseline fallback'));
});
