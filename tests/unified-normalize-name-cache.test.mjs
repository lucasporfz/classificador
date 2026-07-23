import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context = { console, Math, JSON, Array, Object, Number, String, Map, Set, isFinite, isNaN, parseInt, parseFloat, Date, Float32Array, Int32Array };
vm.createContext(context);
vm.runInContext(fs.readFileSync('js/unified-formulas.js', 'utf8'), context, { filename:'js/unified-formulas.js' });

const normalizeName = context.UnifiedFormulas.normalizeName;
const referenceNormalizeName = value => String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
for (const value of [
  '', 'darklight matter', 'two  spaces', ' leading', 'trailing ', 'line\nbreak',
  'MIXED Case', 'Crème Brûlée', '\u00a0non-breaking space\u00a0', null, false, 0, 42,
]) {
  assert.equal(normalizeName(value), referenceNormalizeName(value), `canonical parity for ${JSON.stringify(value)}`);
}
assert.equal(normalizeName('  DarkLight\tMatter  '), 'darklight matter');
assert.equal(normalizeName('  DarkLight\tMatter  '), 'darklight matter');

assert.equal(normalizeName('DARKLIGHT MATTER'), 'darklight matter');
assert.equal(normalizeName('darklight  matter'), 'darklight matter');

assert.equal(normalizeName(null), '');
assert.equal(normalizeName(0), '');
assert.equal(normalizeName(42), '42');

for (let index = 0; index < 5000; index++) normalizeName(`unique mob ${index}`);
assert.equal(normalizeName('  DarkLight\tMatter  '), 'darklight matter');

console.log('unified normalize name cache: OK');
