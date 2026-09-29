import assert from 'node:assert/strict';
import test from 'node:test';
import { createLocalFixtureDatabase } from '../support/local-fixture-database.mjs';

test('parallel disposable schemas share extensions that survive fixture cleanup', async () => {
  const results = await Promise.allSettled([
    createLocalFixtureDatabase('extension_first'),
    createLocalFixtureDatabase('extension_second'),
  ]);
  const fixtures = results.filter(result => result.status === 'fulfilled').map(result => result.value);
  try {
    for (const result of results) if (result.status === 'rejected') throw result.reason;
    for (const fixture of fixtures) {
      const extensions = await fixture.database.query(`SELECT extname,nspname FROM pg_extension
        JOIN pg_namespace ON extnamespace=pg_namespace.oid
        WHERE extname IN ('pgcrypto','btree_gist') ORDER BY extname`);
      assert.deepEqual(extensions.rows, [{ extname: 'btree_gist', nspname: 'public' }, { extname: 'pgcrypto', nspname: 'public' }]);
      assert.equal((await fixture.database.query('SELECT octet_length(gen_random_bytes(32)) AS length')).rows[0].length, 32);
    }
    await fixtures.shift().close();
    assert.equal((await fixtures[0].database.query('SELECT octet_length(gen_random_bytes(32)) AS length')).rows[0].length, 32);
  } finally { await Promise.all(fixtures.map(fixture => fixture.close())); }
});
