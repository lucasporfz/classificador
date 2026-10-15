// M-039 (14/Out/2026) — o omega entra ANTES da resistencia da criatura, com ROUND:
//   O' = ROUND(O × 1,06)  e depois  E = ROUND(O' × m)   (D-010a/D-010b)
// Antes era multiplicador pos-mitigacao dentro de P, invertido com FLOOR ∪ CEIL.
//
// Sintetico de proposito: mob controlado (mitigation 0, armor 0, pierce 0, mod 1,18) para que a
// cadeia colapse em F = ROUND(ROUND(O × 1,06) × 1,18) e os originais sejam conferidos a mao.
//   O = 720 com omega:  ROUND(763,2) = 763;  ROUND(763 × 1,18) = ROUND(900,34) = 900
//   O = 720 sem omega:  ROUND(849,6) = 850
// Na leitura antiga, F = 900 so admite A = 849 (CEIL(849 × 1,06) = 900), e ROUND(O × 1,18) pula
// o 849: o hit ficava sem original.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';

const ENGINE_FILES = [
  'js/stats.js', 'js/mob-element-mods.js', 'js/mob-element-mods-post-2026-06-16.js',
  'js/unified-session-context.js', 'js/unified-formulas.js', 'js/unified-parsing.js', 'js/unified-setup-inference.js',
  'js/unified-validation.js', 'js/unified-turn-resolution.js', 'js/unified-classification-engine.js',
];
const silent = { log() {}, warn() {}, error() {}, info() {}, debug() {} };
const ctx = { console: silent, Math, JSON, Array, Object, Number, String, Map, Set, WeakMap, isFinite, isNaN, parseInt, parseFloat, Date, Float32Array, Int32Array };
ctx.globalThis = ctx; ctx.window = ctx;
vm.createContext(ctx);
for (const file of ENGINE_FILES) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
const F = ctx.UnifiedFormulas;

const MOB = 'test acolyte';
const MODS = { [MOB]: { hitpoints: 10000, holyDmgMod: 1.18, physicalDmgMod: 1.18, mitigation: 0, armor: 0 } };
const context = () => ({
  mobModsPost: MODS, sessionDateKey: 20260701, useFloat16Mitigation: true,
  gravSanSetup: { bonus: 0, windows: [] },
  critSetup: { byComponent: {}, fallback: 1, multiplier: 1 },
  omegaSetup: { active: true, multiplier: 1.06 },
});
const hit = (dmg, seq, omega) => ({ mob: MOB, dmg, seq, ts: 1000, type: 'normal', omegaActive: !!omega });
const originals = (h, c) => Array.from(F.elementalOriginalCandidates(h, 'holy', c).originals);

test('elemental: o hit com omega reverte pelo omega antes do mod', () => {
  const c = context();
  assert.deepEqual(originals(hit(900, 1, true), c), [720]);
  assert.deepEqual(originals(hit(850, 2, false), c), [720]);
});

test('omega nao e multiplicador pos-mitigacao', () => {
  assert.equal(F.postMultiplier(hit(900, 1, true), context()), 1);
});

test('fisico: o intervalo do hit com omega contem o mesmo original do hit sem omega', () => {
  const c = context();
  const w = F.physicalOriginalInterval(hit(900, 1, true), c).interval;
  const n = F.physicalOriginalInterval(hit(850, 2, false), c).interval;
  assert.ok(w && w[0] <= 720 && 720 <= w[1], `com omega ${w}`);
  assert.ok(n && n[0] <= 720 && 720 <= n[1], `sem omega ${n}`);
});

test('cache de reversao nao colide entre estados de omega (mesmo dano, mob e estado)', () => {
  const c = context();
  const a = originals(hit(900, 1, false), c);
  const b = originals(hit(900, 2, true), c);
  assert.notDeepEqual(a, b);
  const pa = F.physicalOriginalInterval(hit(900, 3, false), c).interval;
  const pb = F.physicalOriginalInterval(hit(900, 4, true), c).interval;
  assert.notDeepEqual(pa, pb);
});

test('sessao sem omega: o rotulo do hit e ignorado', () => {
  const c = Object.assign(context(), { omegaSetup: { active: false, multiplier: 1 } });
  assert.deepEqual(originals(hit(850, 1, true), c), [720]);
});
