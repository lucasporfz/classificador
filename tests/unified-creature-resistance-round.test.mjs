// D-010a / D-010b (change round-creature-resistance-step): o passo da resistencia da criatura e
// `E = ROUND(O × m)` (.5 para cima), invertido em inteiros; D-010g: hit critico nao vota no
// fallback de Bounty por componentes congelados.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const silent = { log() {}, warn() {}, error() {}, info() {}, debug() {} };
const ctx = { console: silent, Math, JSON, Array, Object, Number, String, Map, Set, Date, isFinite, isNaN, parseInt, parseFloat, Float32Array, Int32Array };
ctx.globalThis = ctx;
ctx.window = ctx;
vm.createContext(ctx);
for (const file of [
  'js/mob-element-mods.js',
  'js/mob-element-mods-post-2026-06-16.js',
  'js/unified-session-context.js', 'js/unified-formulas.js',
  'js/unified-parsing.js',
  'js/unified-setup-inference.js',
  'js/unified-validation.js',
  'js/unified-turn-resolution.js',
  'js/unified-classification-engine.js',
]) {
  vm.runInContext(read(file), ctx, { filename: file });
}
const UF = ctx.UnifiedFormulas;

// --- invRound em inteiros ---------------------------------------------------------------
assert.equal(typeof UF.invRound, 'function', 'invRound precisa ser exportado');
assert.deepEqual(Array.from(UF.invRound(794, 1.12)), [709, 709], '709 × 1,12 = 794,08 -> 794');
assert.deepEqual(Array.from(UF.invRound(6, 1.1)), [5, 5], '.5 arredonda para cima: 5 × 1,1 = 5,5 -> 6');
const gap = UF.invRound(5, 1.1);
assert.ok(gap[0] > gap[1], 'E = 5 e inalcancavel com m = 1,1 (4 -> 4, 5 -> 6)');
assert.throws(() => UF.invRound(10, 1.0000001), /casas/, 'mod com mais de 6 casas falha alto');
// a escala inteira de 10^6 e identica a de 100 para os mods reais de 2 casas
for (const q of [0.85, 0.9, 1, 1.02, 1.1, 1.12, 1.15, 1.22, 1.25, 1.5]) {
  const m100 = Math.round(q * 100);
  for (let y = 1; y <= 3000; y++) {
    assert.deepEqual(Array.from(UF.invRound(y, q)), [Math.ceil((100 * y - 50) / m100), Math.floor((100 * y + 49) / m100)], `q=${q} y=${y}`);
  }
}

// --- caso-gabarito 33: elemental fecha exato, sem tolerancia ------------------------------
const boarMan = { holyDmgMod: 1.1, physicalDmgMod: 1.12, mitigation: 3.45, armor: 0 };
const caseCtx = {
  getMobMods: () => boarMan,
  useFloat16Mitigation: true,
  bmPierce: 0.04,
  critSetup: { byComponent: {}, fallback: 2, multiplier: 2 },
};
const crit33 = UF.elementalOriginalCandidates({ mob: 'boar man', dmg: 1533, realCrit: true, ts: 0 }, 'holy', caseCtx);
assert.equal(crit33.mod, 1.12);
assert.equal(crit33.intermediateToleranceUsed, 0, 'com ROUND o caso 33 nao precisa da tolerancia');
assert.ok(crit33.originals.includes(709), `original 709 esperado, veio ${crit33.originals}`);

// --- eixo fisico: extremos por ROUND -------------------------------------------------------
const flat = { holyDmgMod: 1, physicalDmgMod: 1.12, mitigation: 0, armor: 0 };
const physCtx = { getMobMods: () => flat, useFloat16Mitigation: true };
const phys = UF.physicalOriginalInterval({ mob: 'x', dmg: 794, ts: 0 }, physCtx);
assert.deepEqual(Array.from(phys.interval), [709, 709], 'fisico: E = 794 com m = 1,12 reverte em [709, 709] (CEIL dava vazio)');

// --- D-010g: componente critico nao vota (drone ingol S0 18:34:05) ------------------------
const result = ctx.UnifiedClassificationEngine.classifyUnified(
  read('logs/drone ingol Server Log.txt'),
  read('logs/drone ingol Local Chat.txt'),
  { mobModsPre: ctx.MOB_ELEMENT_MODS, mobModsPost: ctx.MOB_ELEMENT_MODS_POST_2026_06_16, strictLeech: true, maxOriginal: 6000, useFloat16Mitigation: true },
);
assert.ok(!result.error, result.error);
const damage = result.bountyTalismanSetup.damage;
assert.equal(damage.source, 'frozen_deterministic_component_original');
assert.equal(damage.level, 25);
assert.equal(damage.contradictions, 0);
assert.equal(damage.evidenceCount, 36, 'nivel 25 com 36 encaixes sob ROUND e sem componentes criticos');
for (const row of damage.ranked) {
  for (const example of row.examples || []) {
    assert.ok(!(example.turn === '18:34:05'), 'o componente critico de 18:34:05 nao pode votar');
  }
}
assert.equal(result.bountyTalismanSetup.life.level, 5);

console.log('OK: passo da resistencia da criatura em ROUND; critico fora do fallback de Bounty');
