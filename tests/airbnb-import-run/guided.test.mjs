import assert from 'node:assert/strict';
import test from 'node:test';
import { PassThrough, Writable } from 'node:stream';
import { spawnSync } from 'node:child_process';
import { parseOptions, validateTarget, validateKey, makePrompter, inspectDocuments } from '../../site/scripts/import-airbnb-run.mjs';

test('explicit write options and external targets only; rejection never echoes secrets', () => {
  assert.equal(parseOptions([]).apply, false);
  assert.deepEqual(parseOptions(['--apply', '--allow-production']), { apply: true, allowProduction: true, help: false });
  assert.throws(() => parseOptions(['--database=secret']), /Unknown option/);
  const valid = 'postgresql://user:PRIVATE@dpg-example-a.frankfurt-postgres.render.com:5432/soccotash_development';
  assert.equal(validateTarget(valid).database, 'soccotash_development');
  for (const url of ['jdbc:' + valid, valid + '?sslmode=disable', valid.replace('dpg-example-a.frankfurt-postgres.render.com', 'localhost'), valid.replace(':PRIVATE', ''), valid.replace('.render.com', '.render.com.evil.test')]) {
    assert.throws(() => validateTarget(url), error => !error.message.includes('PRIVATE'));
  }
  validateKey('ab'.repeat(32), '1');
  assert.throws(() => validateKey('secret', '1'), /64 hexadecimal/);
  assert.throws(() => validateKey('ab'.repeat(32), '0'), /positive integer/);
});

function terminal() {
  const input = new PassThrough(); input.isTTY = true;
  let printed = '';
  const output = new Writable({ write(chunk, encoding, next) { printed += chunk.toString(); next(); } });
  output.isTTY = true;
  return { input, ask: makePrompter(input, output), printed: () => printed };
}
test('ordinary prompts survive readline redraws and retain their label while typing', async () => {
  const t = terminal();
  const label = 'Target (development / production): ';
  const answer = t.ask(label);
  // Readline clears the line before painting its prompt. The label must occur
  // after that clearing sequence, rather than only before question() is called.
  assert.ok(t.printed().slice(t.printed().lastIndexOf('\x1b[0J')).includes(label));
  t.input.write('development');
  assert.ok(t.printed().includes(label));
  t.input.write('\r');
  assert.equal(await answer, 'development');
});

test('secret prompts suppress typed secrets, including terminal paste, and cancellation restores input', async () => {
  const t = terminal();
  const answer = t.ask('Hidden value: ', true);
  t.input.write('TOP-SECRET\r');
  assert.equal(await answer, 'TOP-SECRET');
  assert.ok(!t.printed().includes('TOP-SECRET'));
  const cancelled = t.ask('Hidden again: ', true);
  t.input.write('\x03');
  await assert.rejects(cancelled, /Cancelled/);
  assert.equal(t.input.isPaused(), true);
});

test('CLI help and non-interactive rejection do not connect or leak inherited secrets', () => {
  const env = { ...process.env, DATABASE_URL: 'SECRET-URL', AIRBNB_IMPORT_ENCRYPTION_KEY: 'SECRET-KEY' };
  delete env.NODE_TEST_CONTEXT;
  for (const args of [['--help'], []]) {
    const result = spawnSync(process.execPath, ['--experimental-strip-types', 'site/scripts/import-airbnb-run.mjs', ...args], { encoding: 'utf8', env });
    assert.equal(result.status, args.length ? 0 : 1);
    assert.doesNotMatch(result.stdout + result.stderr, /SECRET-URL|SECRET-KEY/);
  }
});

test('evidence path conflicts stop before writes', async () => {
  const database = { async query(sql) { assert.match(sql, /^SELECT/); if (sql.startsWith('SELECT id FROM airbnb_reviews')) return { rows: [] }; return { rows: [{ sha256: 'different', document_type: 'review', source_external_id: '1' }] }; } };
  await assert.rejects(inspectDocuments(database, { reviews: [{ sha256: 'a', relativePath: 'output/pdf/a.pdf', review: { source: { reviewId: '1' } } }] }), /Conflicting review evidence/);
});

test('production apply requires additional explicit flag before requesting secrets', async () => {
  const { main } = await import('../../site/scripts/import-airbnb-run.mjs');
  let calls = 0;
  await assert.rejects(main(['--apply'], async () => { calls++; return 'production'; }), /--allow-production/);
  assert.equal(calls, 1);
});
