import { parseArgs } from 'node:util';
import { getPool } from '../src/lib/booking/db.ts';
import { getProperties } from '../src/lib/booking/config.ts';
import { defaultHistoryInput, parseHistoryInput } from '../src/lib/pricing/history.ts';
import { getHistoryReport } from '../src/lib/pricing/history-repository.ts';
import { historyCsv } from '../src/lib/pricing/history-csv.ts';

// Uses the supplied DATABASE_URL. Only aggregate output; no guest details or writes.
const { values } = parseArgs({ options: {
  property: { type: 'string', default: 'main-house' },
  from: { type: 'string' }, to: { type: 'string' }, year: { type: 'string' },
  uplift: { type: 'string', default: '0' }, format: { type: 'string', default: 'profile' },
} });
try {
  if (!process.env.DATABASE_URL) throw new Error('Supply DATABASE_URL for the intended database.');
  if (!['profile', 'json', 'csv'].includes(values.format!)) throw new Error('Choose profile, json or csv format.');
  const defaults = defaultHistoryInput(values.property!);
  const input = parseHistoryInput({ ...defaults, startDate: values.from ?? defaults.startDate, endDate: values.to ?? defaults.endDate,
    targetYear: values.year ? Number(values.year) : defaults.targetYear, upliftPercent: Number(values.uplift),
  }, getProperties().map(p => p.id));
  const report = await getHistoryReport(input);
  if (values.format === 'csv') process.stdout.write(historyCsv(report));
  else process.stdout.write(JSON.stringify(values.format === 'json' ? report : {
    input: report.input, calculatedAt: report.calculatedAt, methodVersion: report.methodVersion,
    sourceCapturedFrom: report.sourceCapturedFrom, sourceCapturedTo: report.sourceCapturedTo,
    profile: report.profile, consideredReservations: report.consideredReservations,
    includedReservations: report.includedReservations, exclusions: report.exclusions,
  }, null, 2) + '\n');
} catch {
  // Never print an error object which could carry a database URL or financial evidence.
  console.error('Historical pricing report failed. Check the database connection and report arguments.');
  process.exitCode = 1;
} finally {
  if (process.env.DATABASE_URL) await getPool().end();
}
