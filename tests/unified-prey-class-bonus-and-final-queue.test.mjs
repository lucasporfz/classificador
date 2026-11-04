// D-010f, D-010i e M-036b: fila de bonus finais com FLOOR por passo, Perfect Shot no fim e
// bonus de classe pelos hits com prey.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const silent = { log() {}, warn() {}, error() {}, info() {}, debug() {} };
const context = {
  console: silent, Math, JSON, Array, Object, Number, String, Map, WeakMap, Set,
  isFinite, isNaN, parseInt, parseFloat, Date, Float32Array, Int32Array,
};
context.globalThis = context;
context.window = context;
vm.createContext(context);
for (const file of [
  'js/stats.js',
  'js/mob-element-mods.js',
  'js/mob-element-mods-post-2026-06-16.js',
  'js/unified-session-context.js', 'js/unified-formulas.js',
  'js/unified-parsing.js',
  'js/unified-setup-inference.js',
  'js/unified-validation.js',
  'js/unified-turn-resolution.js',
  'js/unified-classification-engine.js',
]) {
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
}
const source = fs.readFileSync('js/unified-formulas.js', 'utf8');

function reachablePrey(bonus, max) {
  const reach = new Set();
  const q = Math.round((1 + bonus) * 1e6) / 1e6;
  for (let x = 1; x * 1.25 * q <= max + 3; x++) reach.add(Math.floor(Math.floor(x * 1.25) * q));
  return reach;
}

test('M-036b: FLOOR depois do prey nunca deixa resto 4; o perk depois dele deixa', () => {
  const preyOnly = reachablePrey(0, 3000);
  assert.equal(preyOnly.has(2764), false, 'o 2764 de quara plunderer e impossivel so com prey');
  const withPerk = reachablePrey(0.025, 3000);
  assert.equal(withPerk.has(2764), true, '2158 -> 2697 -> 2764');
});

test('D-010i: a reversao de hit usa a fila, sem o produto unico', () => {
  assert.match(source, /const postIntervals = inverseFinalBonusIntervals\(\+hit\.dmg, hit, context\);/);
  assert.doesNotMatch(source, /inversePostMultiplierIntervals\(\+hit\.dmg, post\)/);
});

test('D-010f: o +20 do Perfect Shot sai antes da fila', () => {
  assert.match(source, /const PERFECT_SHOT_BONUS = 20;/);
  assert.doesNotMatch(source, /c0 - perfectShotBonus/);
  assert.doesNotMatch(source, /c - perfectShotBonus/);
  // drone bounty 07:01:25: 953 - 20 = 933 = FLOOR(830 x 1,125); 953 sozinho e impossivel.
  const step = x => Math.floor(x * 1.125);
  const reach = new Set();
  for (let x = 1; x < 1000; x++) reach.add(step(x));
  assert.equal(reach.has(953), false);
  assert.equal(step(830), 933);
});
