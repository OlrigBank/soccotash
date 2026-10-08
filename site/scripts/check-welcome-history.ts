import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { welcomeSchema, welcomeContactSchema, assertWelcomeHistory } from '../src/lib/welcome.ts';

const current = welcomeSchema.parse(parse(readFileSync(new URL('../src/data/welcome.yml', import.meta.url), 'utf8')));
welcomeContactSchema.parse(parse(readFileSync(new URL('../src/data/settings/contact.yml', import.meta.url), 'utf8')));
const git = (...args: string[]) => execFileSync('git', args, {
  cwd: new URL('../../', import.meta.url), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
}).trim();
if (git('rev-parse', '--is-shallow-repository') === 'true') throw new Error('Welcome history checks require a full checkout (fetch-depth: 0).');
const path = 'site/src/data/welcome.yml';
const commits = git('log', '--format=%H', 'HEAD', '--', path).split('\n').filter(Boolean);
for (const commit of commits) {
  // A committed deletion must fail rather than erase earlier topic history.
  const previous = welcomeSchema.parse(parse(git('show', `${commit}:${path}`)));
  assertWelcomeHistory(previous, current);
}
console.log(`Welcome content and contact settings valid; ${commits.length} historical snapshots checked.`);
