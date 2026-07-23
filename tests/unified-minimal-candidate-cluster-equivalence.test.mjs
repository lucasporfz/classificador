import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context = { console, Math, JSON, Array, Object, Number, String, Map, WeakMap, Set, isFinite, isNaN, parseInt, parseFloat, Date, Float32Array, Int32Array };
vm.createContext(context);
for (const file of [
  'js/unified-formulas.js',
  'js/unified-parsing.js',
  'js/unified-setup-inference.js',
  'js/unified-validation.js',
]) {
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
}

function sortedUnique(values) {
  return [...new Set(values)].sort((a, b) => a - b);
}

function referenceMinimalCandidateCluster(sets) {
  const clean = (sets || [])
    .map((set, idx) => ({ idx, values: sortedUnique((set || []).filter(v => Number.isFinite(v)).map(v => Math.round(v))) }))
    .filter(x => x.values.length);
  if (!clean.length || clean.length !== (sets || []).length) return null;

  let best = null;
  for (const anchor of clean) {
    for (const base of anchor.values) {
      const chosen = [];
      let min = base;
      let max = base;
      for (const item of clean) {
        const vals = item.values;
        let pick = vals[0];
        let dist = Math.abs(vals[0] - base);
        for (let i = 1; i < vals.length; i++) {
          const d = Math.abs(vals[i] - base);
          if (d < dist || (d === dist && vals[i] < pick)) {
            pick = vals[i];
            dist = d;
          }
        }
        chosen[item.idx] = pick;
        if (pick < min) min = pick;
        if (pick > max) max = pick;
      }
      const span = max - min;
      const center = (min + max) / 2;
      if (!best || span < best.span || (span === best.span && Math.abs(center - base) < Math.abs(best.center - base))) {
        best = { min, max, span, center, chosen };
      }
    }
  }
  return best;
}

function comparable(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function assertEquivalent(sets) {
  const actual = context.UnifiedValidation.minimalCandidateCluster(sets);
  assert.deepEqual(comparable(actual), comparable(referenceMinimalCandidateCluster(sets)));
}

assertEquivalent(null);
assertEquivalent([]);
assertEquivalent([[]]);
assertEquivalent([[1], []]);
assertEquivalent([[0], [10]]);
assertEquivalent([[0, 10], [5]]);
assertEquivalent([[1, 3], [2, 2], [1, 3]]);
assertEquivalent([[NaN, 1.4, 1.6], [Infinity, -3.5, 8.5]]);

let state = 0x9e3779b9;
function random() {
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return (state >>> 0) / 0x100000000;
}

for (let sample = 0; sample < 2000; sample++) {
  const sets = [];
  const setCount = 1 + Math.floor(random() * 6);
  for (let setIndex = 0; setIndex < setCount; setIndex++) {
    const values = [];
    const valueCount = 1 + Math.floor(random() * 12);
    for (let valueIndex = 0; valueIndex < valueCount; valueIndex++) {
      values.push((Math.floor(random() * 81) - 40) + random());
      if (random() < 0.2) values.push(values[values.length - 1]);
    }
    sets.push(values);
  }
  assertEquivalent(sets);
}

console.log('unified minimal candidate cluster equivalence: OK');
