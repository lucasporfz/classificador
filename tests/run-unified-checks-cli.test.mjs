import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const run = args => spawnSync(process.execPath, ['tools/run-unified-checks.mjs', ...args], {
  cwd: ROOT,
  encoding: 'utf8',
});
const output = result => (result.stdout || '') + (result.stderr || '');

const oneTest = run(['--tests', '--match', 'classification-fingerprint']);
assert.equal(oneTest.status, 0, output(oneTest));
assert.match(output(oneTest), /1\/1 alvos OK/);
assert.match(output(oneTest), /unified-classification-fingerprint\.test\.mjs/);

for (const args of [
  ['--match', 'fingerprint'],
  ['--gabarito', '--tests', '--match', 'fingerprint'],
  ['--tests', '--match'],
  ['--tests', '--match', 'does-not-exist'],
  ['--unknown'],
]) {
  const result = run(args);
  assert.equal(result.status, 2, `${args.join(' ')}\n${output(result)}`);
}

console.log('run unified checks CLI: OK');
