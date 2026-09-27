import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

import { createUnifiedContext, splitSessions, pairSessions } from '../tools/unified-corpus.mjs';

// Change B (`model-sorcerer-beam-sublines`): sub-linhas do beam de sorcerer (M-035, M-035b).
// Os esperados vem do log e da regra (tabela da Fase 1 e turn stories do design), nunca da
// saida do motor. Rotulos comparados como texto: arrays que saem do `vm` tem prototype de
// outro realm.

const ROOT = process.cwd();

// --- Turnos reais, com as MESMAS opcoes da UI ---------------------------------------------
const engine = createUnifiedContext(ROOT);
const sessionCache = new Map();
function session(server, local, index) {
  const key = `${server}|${index}`;
  if (sessionCache.has(key)) return sessionCache.get(key);
  const read = name => fs.readFileSync(path.join(ROOT, 'logs', name), 'utf8');
  const pair = pairSessions(splitSessions(read(server)), splitSessions(read(local)))[index];
  assert.ok(pair, `sessao ausente: ${server} S${index}`);
  const result = engine.UnifiedClassificationEngine.classifyUnified(pair.sv.text, pair.lc.text, {
    mobModsPre: engine.MOB_ELEMENT_MODS, mobModsPost: engine.MOB_ELEMENT_MODS_POST_2026_06_16,
    strictLeech: true, maxOriginal: 6000, useFloat16Mitigation: true,
  });
  assert.ok(result && !result.error, `sessao nao classificou: ${server} S${index}`);
  sessionCache.set(key, result);
  return result;
}
const AL2 = () => session('alumnishocks 2 server log.txt', 'alumnishocks 2 localchat.txt', 0);
const AQ = index => session('aquatic Server Log.txt', 'aquatic Local Chat.txt', index);
const KIM = () => session('kim server log.txt', 'kim local chat.txt', 0);
const MR2 = () => session('Mrowdy Server Log 2.txt', 'Mrowdy Local Chat 2.txt', 0);
const MSB = () => session('ms boss server log.txt', 'ms boss local chat.txt', 14);

const toSec = clock => { const [h, m, s] = clock.split(':').map(Number); return h * 3600 + m * 60 + s; };
function turnAt(result, clock) {
  const turn = (result.turns || []).find(t => t.ts === toSec(clock));
  assert.ok(turn, `turno ${clock} ausente`);
  return turn;
}
function counts(turn) {
  const n = { arrow: 0, spell: 0, rune: 0, grenade: 0 };
  for (const c of turn.components || []) if (n[c.comp] != null) n[c.comp] += (c.hits || []).length;
  return `A${n.arrow} S${n.spell} R${n.rune} G${n.grenade}`;
}
const token = h => `${h.dmg}${h.overkill ? ' OK' : ''}`;
const sorted = list => list.slice().sort((a, b) => parseFloat(a) - parseFloat(b) || a.localeCompare(b)).join(', ');
function beamLabels(turn) {
  const spell = (turn.components || []).find(c => c.comp === 'spell');
  assert.ok(spell, 'turno sem componente spell');
  const out = { central: [], side: [], none: [] };
  for (const h of spell.hits || []) {
    if (h.virtual) continue;
    out[h.beamSide === 'central' ? 'central' : h.beamSide === 'side' ? 'side' : 'none'].push(token(h));
  }
  return { central: sorted(out.central), side: sorted(out.side), none: sorted(out.none) };
}
function anyBeamSide(turn) {
  return (turn.components || []).some(c => (c.hits || []).some(h => h.beamSide));
}

// M-035b: todo overkill provado cai no nivel do dano real dele.
test('M-035b: aquatic S2 13:05:51 poe o 763 OK no central pelo leech dos 4394', () => {
  const labels = beamLabels(turnAt(AQ(2), '13:05:51'));
  assert.equal(labels.central, '763 OK, 4394, 4394');
  assert.equal(labels.side, '2376 OK, 2509, 2606, 2606, 3077, 3077');
  assert.equal(labels.none, '');
});

test('M-035b: alumnishocks 2 18:25:16 rotula os cinco overkills pelo nivel do dano real', () => {
  const turn = turnAt(AL2(), '18:25:16');
  assert.equal(beamOf(turn).beamElement, 'energy');
  assert.equal(beamOf(turn).beamMasteryStage, 1);
  const labels = beamLabels(turn);
  assert.equal(labels.central, '20 OK, 1156 OK, 1656');
  assert.equal(labels.side, '94 OK, 145 OK, 235 OK, 396, 396, 396, 434');
  assert.equal(labels.none, '');
});

test('M-035b: aquatic S0 10:44:32 tem o 588 OK no central (mana do raider 3004)', () => {
  const turn = turnAt(AQ(0), '10:44:32');
  assert.equal(beamOf(turn).beamElement, 'energy');
  assert.equal(beamOf(turn).beamMasteryStage, 3);
  const labels = beamLabels(turn);
  assert.ok(labels.central.split(', ').includes('588 OK'), `central: ${labels.central}`);
});

// M-035, leech esparso na sub-linha: >=1 confirmacao e 0 contradicao valem como na spell concreta.
// fire: central source 2420 -> original 2143; laterais -> 1869; 1869/2143 = 0,8721
// = 0,70 x 1,42 / 1,14 (stage 3, lateral com 3+ alvos e central com 1).
const DLC = index => session('dlc ms Server Log.txt', 'dlc ms Local Chat.txt', index);
test('M-035 leech esparso: dlc ms S0 21:44:27 valida em fire, stage 3, com o leech esparso do lateral', () => {
  const turn = turnAt(DLC(0), '21:44:27');
  assert.equal(counts(turn), 'A0 S6 R0 G0');
  const beamResult = (turn.components || []).find(c => c.comp === 'spell').deterministic || {};
  assert.equal(beamResult.beam && beamResult.ok, true, `bloco final: ${beamResult.reason}`);
  assert.equal(beamResult.beamElement, 'fire');
  assert.equal(beamResult.beamMasteryStage, 3);
  assert.ok(Math.abs(beamResult.beamFraction - 0.8721) < 0.005, `fracao ${beamResult.beamFraction}`);
  const labels = beamLabels(turn);
  assert.equal(labels.central, '2420');
  assert.equal(labels.side, '2111, 2111, 2856, 2865, 2865');
});

// M-035 + M-043: o elemento do beam vem da ordem da maquina de conversao, nao do menor
// desvio da fracao. `arm`/`rearm` -> estancia; `converted` -> estancia primeiro.
const DE = () => session('death echo server log.txt', 'death echo local chat.txt', 0);
function beamOf(turn) {
  return (turn.components || []).find(c => c.comp === 'spell').deterministic || {};
}
const ELEMENT_CASES = [
  // [nome, sessao, relogio, elemento, stage, central, side]
  ['alumnishocks 2 18:30:18 (arm, energy)', AL2, '18:30:18', 'energy', 1, '1320', '121 OK, 389, 389'],
  ['aquatic S2 13:05:51 (arm, energy)', () => AQ(2), '13:05:51', 'energy', 3, '763 OK, 4394, 4394', '2376 OK, 2509, 2606, 2606, 3077, 3077'],
  ['death echo 11:06:22 (rearm, death)', DE, '11:06:22', 'death', 3, '504 OK, 1700, 1805', '1189, 1263, 1263, 1263, 1263'],
  ['dlc ms S1 21:52:46 (converted, fire)', () => DLC(1), '21:52:46', 'fire', 3, '4053, 4066', '3158, 3158, 3158 OK'],
];
for (const [name, source, clock, element, stage, central, side] of ELEMENT_CASES) {
  test(`M-035/M-043: ${name}`, () => {
    const turn = turnAt(source(), clock);
    const beamResult = beamOf(turn);
    assert.equal(beamResult.beam && beamResult.ok, true, `bloco final: ${beamResult.reason}`);
    assert.equal(beamResult.beamElement, element);
    assert.equal(beamResult.beamMasteryStage, stage);
    const labels = beamLabels(turn);
    assert.equal(labels.central, central);
    assert.equal(labels.side, side);
    assert.equal(labels.none, '');
  });
}

// M-035b forma A: as ancoras formam UM nivel so e sao todas laterais; o central so aparece
// em overkill, com o nivel pelo dano real provado. alumnishocks 2 S0, energy, stage 1.
const FORM_A_CASES = [
  ['18:26:16', 'A1 S6 R0 G0', '175 OK', '91 OK, 653, 653, 684, 684', 0.2955],
  ['18:31:29', 'A1 S6 R0 G0', '1560 OK, 1622 OK', '445, 445, 466, 466'],
  ['18:31:42', 'A1 S4 R0 G0', '1334 OK', '436, 436, 480'],
  ['18:22:39', 'A1 S6 R0 G0', '311 OK, 2015 OK, 2745 OK', '739 OK, 803, 803'],
  ['18:25:35', 'A1 S5 R0 G0', '1520 OK', '484, 506, 506, 531'],
  ['18:27:45', 'A1 S6 R0 G0', '20 OK, 1185 OK', '452, 452, 452, 474'],
  ['18:28:09', 'A1 S6 R0 G0', '1591 OK', '507, 530, 530, 557, 557'],
  ['18:30:11', 'A1 S3 R0 G0', '1252 OK', '488, 488'],
  ['18:31:14', 'A1 S6 R0 G0', '1067 OK', '431, 431, 431, 452, 452'],
];
for (const [clock, shape, central, side, fraction] of FORM_A_CASES) {
  test(`M-035b forma A: alumnishocks 2 ${clock}`, () => {
    const turn = turnAt(AL2(), clock);
    assert.equal(counts(turn), shape);
    const beamResult = beamOf(turn);
    assert.equal(beamResult.beam && beamResult.ok, true, `bloco final: ${beamResult.reason}`);
    assert.equal(beamResult.beamElement, 'energy');
    assert.equal(beamResult.beamMasteryStage, 1);
    // 0,25 x 1,30 / 1,10 = 0,2955 (stage 1, lateral com 3+ alvos, central com 1).
    if (fraction != null) assert.ok(Math.abs(beamResult.beamExpectedFraction - fraction) < 0.0005, `fracao ${beamResult.beamExpectedFraction}`);
    const labels = beamLabels(turn);
    assert.equal(labels.central, central);
    assert.equal(labels.side, side);
    assert.equal(labels.none, '');
  });
}

test('M-035b forma E: alumnishocks 2 18:31:58 fica sem sub-linha (o 361 OK tem o leech dos 537)', () => {
  const turn = turnAt(AL2(), '18:31:58');
  assert.equal(counts(turn), 'A1 S4 R0 G0');
  assert.equal(anyBeamSide(turn), false);
});

// M-035b (piso): o dano exibido e o leech so subestimam o dano real; o piso exclui sub-linhas.
test('M-035b piso: kim 16:15:34 tem o 1856 OK no central (o dano exibido ja passa do lateral)', () => {
  const labels = beamLabels(turnAt(KIM(), '16:15:34'));
  assert.ok(labels.central.split(', ').includes('1856 OK'), `central: ${labels.central}`);
});

test('M-035b piso: dlc ms S1 21:53:29 nao poe o 1971 OK no lateral (a mana ja implica mais que o lateral)', () => {
  const labels = beamLabels(turnAt(DLC(1), '21:53:29'));
  assert.ok(!labels.side.split(', ').includes('1971 OK'), `side: ${labels.side}`);
});

// M-035b (N com o hit virtual, S-014e): o lateral tem 8 hits visiveis e um charm-kill.
test('M-035b virtual: dlc ms S0 21:37:37 continua beam em fire, stage 3, A0 + Great Death Beam 11', () => {
  const turn = turnAt(DLC(0), '21:37:37');
  assert.equal(counts(turn), 'A0 S11 R0 G0');
  const beamResult = beamOf(turn);
  assert.equal(beamResult.beam && beamResult.ok, true, `bloco final: ${beamResult.reason}`);
  assert.equal(beamResult.beamElement, 'fire');
  assert.equal(beamResult.beamMasteryStage, 3);
});

// M-035b (estado): ancoras nao-criticas e overkills criticos com Low Blow nao se comparam.
test('M-035b estado: aquatic S0 10:44:52 continua beam em energy, stage 3', () => {
  const beamResult = beamOf(turnAt(AQ(0), '10:44:52'));
  assert.equal(beamResult.beam && beamResult.ok, true, `bloco final: ${beamResult.reason}`);
  assert.equal(beamResult.beamElement, 'energy');
  assert.equal(beamResult.beamMasteryStage, 3);
});

// Decisao 3 da Fase 3: ambiguidade real, os dois overkills ficam sem rotulo.
test('M-035b: dlc ms S0 21:35:10 deixa 2990 OK e 6432 OK sem rotulo (central 4 e lateral 9 fecham dos dois jeitos)', () => {
  const labels = beamLabels(turnAt(DLC(0), '21:35:10'));
  const none = labels.none.split(', ');
  assert.ok(none.includes('2990 OK') && none.includes('6432 OK'), `sem rotulo: ${labels.none}`);
});

// Decisao 6 (Fase 4): na forma A, overkill com leech sem prova nao pode ser central.
test('M-035b forma A: dlc ms S0 21:42:47 fica sem sub-linha (2950 OK tem leech e nao tem prova)', () => {
  const turn = turnAt(DLC(0), '21:42:47');
  assert.equal(counts(turn), 'A0 S10 R0 G0');
  assert.equal(anyBeamSide(turn), false);
});

// Colaterais aprovados no gate humano da Fase 4 (27/Set/2026) que fixam comportamento normativo.
const COLLATERAL_LABELS = [
  // [nome, sessao, relogio, hits que TEM de estar no central, hits que TEM de estar no lateral]
  ['kim 16:25:08: o 1923 OK vai ao central pelo leech dele', KIM, '16:25:08', ['1923 OK'], ['1961 OK']],
  ['dlc ms S0 21:36:07: o 4400 OK vai ao central', () => DLC(0), '21:36:07', ['4400 OK'], []],
  ['dlc ms S1 21:52:37: o piso do 6144 OK passa do lateral 2055', () => DLC(1), '21:52:37', ['6144 OK'], []],
  ['dlc ms S1 21:58:41: o piso do 3599 OK (3666) passa do lateral 2709', () => DLC(1), '21:58:41', ['3599 OK'], ['2660 OK']],
];
for (const [name, source, clock, centralHas, sideHas] of COLLATERAL_LABELS) {
  test(`M-035b colateral: ${name}`, () => {
    const labels = beamLabels(turnAt(source(), clock));
    for (const tok of centralHas) assert.ok(labels.central.split(', ').includes(tok), `${tok} fora do central: ${labels.central}`);
    for (const tok of sideHas) assert.ok(labels.side.split(', ').includes(tok), `${tok} fora do lateral: ${labels.side}`);
  });
}

test('M-035b colateral: kim 16:19:24, carimbo orfao de antes, agora fecha como beam em energy, stage 3', () => {
  const beamResult = beamOf(turnAt(KIM(), '16:19:24'));
  assert.equal(beamResult.beam && beamResult.ok, true, `bloco final: ${beamResult.reason}`);
  assert.equal(beamResult.beamElement, 'energy');
  assert.equal(beamResult.beamMasteryStage, 3);
});

test('M-035b colateral: dlc ms S0 21:36:36 fecha pela forma A em fire, stage 3, com 371 OK e 4593 OK centrais', () => {
  const turn = turnAt(DLC(0), '21:36:36');
  const beamResult = beamOf(turn);
  assert.equal(beamResult.beam && beamResult.ok, true, `bloco final: ${beamResult.reason}`);
  assert.equal(beamResult.beamCentralFromOverkill, true);
  assert.equal(beamResult.beamElement, 'fire');
  assert.equal(beamResult.beamMasteryStage, 3);
  assert.equal(beamLabels(turn).central, '371 OK, 4593 OK');
});

// M-035: o stage da Beam Mastery e fato do personagem, um so na sessao, pela unanimidade dos
// beams discriminantes da passada sem leech. Alumni Shocks e stage 1; os outros sorcerers do
// corpus, stage 3; pre-cutoff nao tem beam validado e fica desconhecido.
const AL1 = () => session('alumnishocks server log.txt', 'alumnishocks localchat.txt', 0);
const STAGE_CASES = [
  ['alumnishocks S0', AL1, 1, 5],
  ['alumnishocks 2 S0', AL2, 1, 44],
  ['kim S0', KIM, 3, null],
  ['dlc ms S0', () => DLC(0), 3, null],
  ['dlc ms S1', () => DLC(1), 3, null],
  ['aquatic S0', () => AQ(0), 3, null],
  ['aquatic S1', () => AQ(1), 3, null],
  ['aquatic S2', () => AQ(2), 3, null],
  ['death echo S0', DE, 3, null],
];
for (const [name, source, stage, discriminating] of STAGE_CASES) {
  test(`M-035 stage da sessao: ${name} = ${stage}`, () => {
    const result = source();
    assert.equal(result.beamMasteryStage, stage);
    const evidence = result.beamMasteryStageEvidence || {};
    assert.equal(Array.from(evidence.stages || []).join(','), String(stage));
    if (discriminating != null) assert.equal(evidence.discriminating, discriminating);
    // Com o stage cravado, nenhum beam da sessao valida em outro stage.
    const stagesSeen = new Set();
    for (const turn of result.turns || []) for (const c of turn.components || []) {
      const d = c.deterministic;
      if (d && d.beam && d.ok) stagesSeen.add(d.beamMasteryStage);
    }
    assert.equal(Array.from(stagesSeen).join(','), String(stage));
  });
}

test('M-035 stage da sessao: sorcerer pre-cutoff fica desconhecido (Mrowdy 2 S0, ms boss S14)', () => {
  for (const result of [MR2(), MSB()]) assert.equal(result.beamMasteryStage, null);
});

test('M-035 stage da sessao: unanimidade crava; discordancia ou nenhum discriminante deixa desconhecido', () => {
  const infer = engine.UnifiedClassificationEngine.inferBeamMasteryStageFromResolved;
  const beamTurn = validStages => ({ components: [{ deterministic: { beam: true, ok: true, beamValidStages: validStages } }] });
  assert.equal(infer([beamTurn([1]), beamTurn([1]), beamTurn([1, 3])]).stage, 1, 'o nao-discriminante nao vota');
  assert.equal(infer([beamTurn([3]), beamTurn([3]), beamTurn([3]), beamTurn([1])]).stage, null, 'nunca por maioria');
  assert.equal(infer([beamTurn([1, 3]), beamTurn([2, 3])]).stage, null, 'sem discriminante');
  assert.equal(infer([]).stage, null);
  const evidence = infer([beamTurn([3]), beamTurn([1])]).evidence;
  assert.equal(evidence.discriminating, 2);
  assert.equal(Array.from(evidence.stages).sort().join(','), '1,3');
});

// Guardas, fotografia de hoje decidida pelo usuario na Fase 3.
test('guarda: kim 16:15:56 continua A0 S7 sem sub-linha (o 323 OK nao tem dano real provado)', () => {
  const turn = turnAt(KIM(), '16:15:56');
  assert.equal(counts(turn), 'A0 S7 R0 G0');
  assert.equal(anyBeamSide(turn), false);
});

test('guarda: Mrowdy 2 S0 e ms boss S14 17:16:37 continuam A1 S5 sem sub-linha', () => {
  for (const result of [MR2(), MSB()]) {
    const turn = turnAt(result, '17:16:37');
    assert.equal(counts(turn), 'A1 S5 R0 G0');
    assert.equal(anyBeamSide(turn), false);
  }
});

// --- Sinteticos das provas de M-035b, direto no validador ---------------------------------
// Mob neutro (mod 1, mitigation 0): original === dano. Stage 3 pela leitura que cancela:
// central 2000, lateral 1400 (0,70). O overkill X vem PRIMEIRO no golpe; o dano real dele,
// pelo leech de mana, e o do lateral (1400 com N = 3: mana CEIL(1400 x 0,2 x 0,4) = 112).
// As ancoras tem mana 1 (capped-low em qualquer N): o leech sozinho aceita X nas duas
// sub-linhas, e so a prova do dano real decide.
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const silent = { log() {}, warn() {}, error() {}, info() {}, debug() {} };
const vmContext = {
  console: silent, Math, JSON, Array, Object, Number, String, Map, Set, WeakMap,
  isFinite, isNaN, parseInt, parseFloat, Date, Float32Array, Int32Array,
};
vmContext.globalThis = vmContext;
vmContext.window = vmContext;
vm.createContext(vmContext);
for (const f of ['js/stats.js', 'js/unified-session-context.js', 'js/unified-formulas.js', 'js/unified-parsing.js', 'js/unified-setup-inference.js', 'js/unified-validation.js']) {
  vm.runInContext(read(f), vmContext, { filename: f });
}
const { validateBeamSublineBlock } = vmContext.UnifiedValidation;

const SYNTHETIC = {
  mobModsPre: { 'test mob': { energyDmgMod: 1, mitigation: 0 } },
  useFloat16Mitigation: false,
  leechSetup: { lifeBase: 0.3, manaBase: 0.2 },
};
const ACTION = { text: 'exevo gran vis lux', ts: 100 };

function hit(seq, dmg, extra = {}) {
  return Object.assign({
    mob: 'test mob', dmg, ts: 100, seq, type: 'normal', comp: 'spell',
    lifeLeech: 0, manaLeech: 0, overkill: false, lifeLossEpoch: 0, manaLossEpoch: 0,
  }, extra);
}
function beam(hits) {
  const block = { comp: 'spell', action: ACTION, hits };
  const res = validateBeamSublineBlock(block, SYNTHETIC);
  assert.ok(res, 'validador nao rodou');
  return { res, hits };
}
// X, central 2000, laterais 1400 x2 (ancoras, mana 1 cada = o recurso seguiu entrando).
function formWithOverkill(x, anchorExtra = {}) {
  return beam([
    x,
    hit(1001, 2000, Object.assign({ manaLeech: 1 }, anchorExtra)),
    hit(1002, 1400, Object.assign({ manaLeech: 1 }, anchorExtra)),
    hit(1003, 1400, Object.assign({ manaLeech: 1 }, anchorExtra)),
  ]);
}
const X = extra => hit(1000, 300, Object.assign({ overkill: true, manaLeech: 112 }, extra));

test('M-035b sintetico: a reserva que nao encheu prova o dano real e poe X no lateral', () => {
  const { res, hits } = formWithOverkill(X());
  assert.equal(res.ok, true, res.reason);
  assert.equal(hits[0].beamSide, 'side');
  assert.equal(hits[1].beamSide, 'central');
});

test('M-035b sintetico: reserva que encheu nao prova (o hit seguinte ganha, os outros nao)', () => {
  const { res, hits } = beam([
    X(),
    hit(1001, 2000, { manaLeech: 1 }),
    hit(1002, 1400),
    hit(1003, 1400),
  ]);
  assert.equal(res.ok, true, res.reason);
  assert.equal(hits[0].beamSide, undefined, 'sem prova, X nao ganha rotulo');
});

test('M-035b sintetico: perda de mana no meio do golpe desfaz a prova', () => {
  const { res, hits } = formWithOverkill(X(), { manaLossEpoch: 1 });
  assert.equal(res.ok, true, res.reason);
  assert.equal(hits[0].beamSide, undefined, 'a reserva pode ter esvaziado no meio');
});

test('M-035b sintetico: overkill de estado de critico diferente nao vota no nivel', () => {
  const { res, hits } = formWithOverkill(X({ type: 'crit', realCrit: true }));
  assert.equal(res.ok, true, res.reason);
  assert.equal(hits[0].beamSide, undefined, 'critico contra ancoras nao-criticas nao compara nivel');
});

test('M-035b sintetico: o piso do dano exibido exclui o lateral', () => {
  // 1600 OK sem leech: o dano real e pelo menos 1600, acima do lateral 1400.
  const { res, hits } = formWithOverkill(hit(1000, 1600, { overkill: true }));
  assert.equal(res.ok, true, res.reason);
  assert.equal(hits[0].beamSide, 'central');
});

// --- Sinteticos do elemento do beam sem estancia conhecida (M-035 + M-043) ----------------
// Mob A: energy e death com mod 1. Mob B: energy 1,004295, death 1. Central: A 2000 x2;
// lateral: A 1403 e B 1403. Em energy o lateral e {1403, 1397} (spread 6) com centro 1400 =
// 0,70 x 2000 (desvio 0); em death e {1403, 1403} (spread 0) com desvio 3. O spread decide na
// estancia desconhecida; o contexto sem setup de estancia mantem o desvio primeiro.
const ELEMENT_MODS = {
  'mob a': { energyDmgMod: 1, deathDmgMod: 1, mitigation: 0 },
  'mob b': { energyDmgMod: 1.004295, deathDmgMod: 1, mitigation: 0 },
  'death only': { deathDmgMod: 1, mitigation: 0 },
};
const PROFILED_ACTION = { text: 'exevo gran vis lux', ts: 100, profile: { element: 'energy' } };
function elementBeam(hits, stanceSetup) {
  const context = { mobModsPre: ELEMENT_MODS, useFloat16Mitigation: false };
  if (stanceSetup) context.sorcererStanceSetup = stanceSetup;
  return validateBeamSublineBlock({ comp: 'spell', action: PROFILED_ACTION, hits }, context);
}
const spreadVsDelta = () => [
  hit(1, 2000, { mob: 'mob a' }), hit(2, 2000, { mob: 'mob a' }),
  hit(3, 1403, { mob: 'mob a' }), hit(4, 1403, { mob: 'mob b' }),
];

test('M-035 estancia desconhecida: menor spread primeiro (death), e nao o menor desvio (energy)', () => {
  const unknown = elementBeam(spreadVsDelta(), { stance: 'unknown', casts: [] });
  assert.equal(unknown.ok, true, unknown.reason);
  assert.equal(unknown.beamElement, 'death');
  const handBuilt = elementBeam(spreadVsDelta(), null);
  assert.equal(handBuilt.ok, true, handBuilt.reason);
  assert.equal(handBuilt.beamElement, 'energy', 'contexto sem setup de estancia: desvio primeiro, como antes');
});

test('M-035 estancia desconhecida: no empate de spread vale o perfil', () => {
  const tie = elementBeam([
    hit(1, 2000, { mob: 'mob a' }), hit(2, 2000, { mob: 'mob a' }),
    hit(3, 1400, { mob: 'mob a' }), hit(4, 1400, { mob: 'mob a' }),
  ], { stance: 'unknown', casts: [] });
  assert.equal(tie.ok, true, tie.reason);
  assert.equal(tie.beamElement, 'energy');
});

test('M-035 pre-cutoff: so o elemento nativo (um beam que so fecharia em death nao valida)', () => {
  const deathOnly = () => [2000, 2000, 1400, 1400].map((dmg, i) => hit(i + 1, dmg, { mob: 'death only' }));
  const preCutoff = elementBeam(deathOnly(), { stance: 'not_applicable', casts: [] });
  assert.equal(preCutoff.ok, false);
  const unknown = elementBeam(deathOnly(), { stance: 'unknown', casts: [] });
  assert.equal(unknown.ok, true, unknown.reason);
  assert.equal(unknown.beamElement, 'death');
});

test('M-035b sintetico: o N da sub-linha conta o hit virtual de charm-kill', () => {
  // Lateral real: X + 1400 x2 + um charm-kill (virtual) = N 4. Mana de X no lateral
  // com N = 4: CEIL(1400 x 0,2 x 0,325) = 91. Sem o virtual (N = 3), o nivel nao fecha em
  // sub-linha nenhuma.
  const virtual = { mob: 'test mob', dmg: 0, ts: 100, seq: 1003.1, type: 'virtual', virtual: true, overkill: true, lifeLeech: 0, manaLeech: 0 };
  const { res, hits } = beam([
    X({ manaLeech: 91 }),
    hit(1001, 2000, { manaLeech: 1 }),
    hit(1002, 1400, { manaLeech: 1 }),
    hit(1003, 1400, { manaLeech: 1 }),
    virtual,
  ]);
  assert.equal(res.ok, true, res.reason);
  assert.equal(hits[0].beamSide, 'side');
});
