// S-004c — a atribuicao de omega e ESTADO do hit no gate de exatidao same-mob.
//
// Dois hits do mesmo mob e mesmo estado observado cuja atribuicao de omega DIFERE sao
// comparacao cross-state: vale a OMEGA_CROSS_STATE_TOLERANCE de 1 ponto. Hits com a MESMA
// atribuicao continuam exatos (tolerancia 0), e 2 pontos ou mais continuam sendo
// contradicao dura, mesmo entre estados de omega diferentes.
//
// Sintetico de proposito: mob controlado (mitigation 0, holyDmgMod 1, pierce 0) para que a
// cadeia de D-010a colapse em `F = FLOOR(O x post)` e os originais possam ser conferidos a
// mao dentro do proprio teste. Nao depende de nenhuma tabela real nem de classificar turno.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';

const ENGINE_FILES = [
  'js/stats.js', 'js/mob-element-mods.js', 'js/mob-element-mods-post-2026-06-16.js',
  'js/unified-formulas.js', 'js/unified-parsing.js', 'js/unified-setup-inference.js',
  'js/unified-validation.js', 'js/unified-turn-resolution.js', 'js/unified-classification-engine.js',
];
const silent = { log() {}, warn() {}, error() {}, info() {}, debug() {} };
const ctx = { console: silent, Math, JSON, Array, Object, Number, String, Map, Set, WeakMap, isFinite, isNaN, parseInt, parseFloat, Date, Float32Array, Int32Array };
ctx.globalThis = ctx; ctx.window = ctx;
vm.createContext(ctx);
for (const file of ENGINE_FILES) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
const V = ctx.UnifiedValidation;
const F = ctx.UnifiedFormulas;

const MOB = 'test acolyte';
const MODS = { [MOB]: { hitpoints: 10000, holyDmgMod: 1.0, physicalDmgMod: 1.0, mitigation: 0, armor: 100 } };

function context(omegaActive) {
  return {
    mobModsPost: MODS, sessionDateKey: 20260701, useFloat16Mitigation: true,
    gravSanSetup: { bonus: 0, windows: [] },
    critSetup: { byComponent: {}, fallback: 1, multiplier: 1 },
    omegaSetup: omegaActive ? { active: true, multiplier: 1.06 } : { active: false, multiplier: 1 },
  };
}
const hit = (dmg, seq) => ({ mob: MOB, dmg, seq, ts: 1000, type: 'normal' });
const block = (...dmgs) => ({
  comp: 'spell',
  action: { incantation: 'test holy spell', profile: { label: 'Test Holy Spell' } },
  hits: dmgs.map((d, i) => hit(d, i + 1)),
});
// A folga so pode existir quando o motor ESTA autorizado a relaxar (ultimo recurso).
const relaxed = omegaActive => Object.assign(context(omegaActive), { _omegaCrossStateTolerance: 1 });

// Ancoras: com mod = mit = 1 e post = 1, `O = F`. Com post = 1.06, `O = invFloor(F, 1.06)`.
test('ancoras: a cadeia colapsa em F = FLOOR(O x post) neste mob sintetico', () => {
  const c = context(true);
  const originals = (dmg, post) => {
    const h = Object.assign(hit(dmg, 1), post === 1.06 ? { omegaActive: true } : {});
    const ev = F.elementalOriginalCandidates(h, 'holy', c);
    assert.ok(ev && ev.known && ev.originals && ev.originals.length, `sem candidato para ${dmg}`);
    return ev.originals;
  };
  assert.deepEqual(originals(700, 1), [700], 'hit sem omega: O = F');
  assert.deepEqual(originals(742, 1.06), [700], '742 com omega reverte EXATO para 700 — o par ja fecha hoje');
  assert.deepEqual(originals(743, 1.06), [701], '743 com omega reverte para 701 — 1 ponto acima de 700');
  assert.deepEqual(originals(745, 1.06), [702, 703], '745 com omega reverte para 702/703 — 2 pontos acima de 700');
});

test('S-004c: par misto de omega a 1 ponto nao e contradicao', () => {
  const strict = V.validateElementalBlock(block(700, 743), 'holy', context(true));
  assert.equal(strict.ok, false, 'sem a folga (avaliacao estrita) o par continua vetado');
  assert.equal(strict.reason, 'same_mob_state_exact_original_mismatch');

  const withTolerance = V.validateElementalBlock(block(700, 743), 'holy', relaxed(true));
  assert.equal(withTolerance.ok, true, 'com a folga de 1 ponto o bloco fecha');
});

test('S-004c: par misto de omega ja exato continua fechando sem a folga', () => {
  const r = V.validateElementalBlock(block(700, 742), 'holy', context(true));
  assert.equal(r.ok, true, 'Delta = 0: fecha na avaliacao estrita, sem precisar de folga nenhuma');
});

test('S-004c: par misto de omega a 2 pontos continua contradicao', () => {
  const r = V.validateElementalBlock(block(700, 745), 'holy', relaxed(true));
  assert.equal(r.ok, false, 'a folga e de 1 ponto e nao pode colar 2');
  assert.equal(r.reason, 'same_mob_state_exact_original_mismatch');
});

test('S-004c: a folga so alcanca o par MISTO', () => {
  // 700 e 702 nao admitem nenhuma atribuicao MISTA (nenhum nivel e alcancado pelo candidato
  // sem omega de um e pelo candidato com omega do outro): qualquer atribuicao que feche
  // marca os DOIS, e ai a comparacao volta a ser same-state e exata.
  const r = V.validateElementalBlock(block(700, 702), 'holy', relaxed(true));
  assert.equal(r.ok, false, 'sem par misto a folga cross-state nao se aplica');
  assert.equal(r.reason, 'same_mob_state_exact_original_mismatch');
});

test('S-004c: par que ja fechava sem a folga continua fechando igual', () => {
  // 700/701 ja reconcilia hoje com os DOIS hits marcados omega (interseccao em 661, porque a
  // inversao do passo pos-mitigacao admite FLOOR e CEIL). A folga MUST NOT mudar isso.
  const before = V.validateElementalBlock(block(700, 701), 'holy', context(true));
  const after = V.validateElementalBlock(block(700, 701), 'holy', relaxed(true));
  assert.equal(before.ok, true, 'pre-condicao: o par ja fecha hoje');
  assert.equal(after.ok, true);
  assert.deepEqual(after.intersection, before.intersection, 'a interseccao nao pode mudar');
});

test('S-004c: sessao sem omega detectado nao ganha a folga', () => {
  const r = V.validateElementalBlock(block(700, 743), 'holy', relaxed(false));
  assert.equal(r.ok, false, 'sem omega na sessao o caminho inteiro fica inerte');
  assert.equal(r.reason, 'same_mob_state_exact_original_mismatch');
});

test('S-004c: a folga e opt-in — o default do contexto e tolerancia 0', () => {
  const c = context(true);
  assert.ok(!c._omegaCrossStateTolerance, 'o contexto nasce sem a folga');
  const r = V.validateElementalBlock(block(700, 743), 'holy', c);
  assert.equal(r.ok, false, 'sem o opt-in explicito o comportamento e o de antes de S-004c');
});
