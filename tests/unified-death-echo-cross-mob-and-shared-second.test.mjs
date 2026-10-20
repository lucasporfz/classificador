// M-016d-1a, emenda de 20/Out/2026 (change `fix-death-echo-cross-mob-echo-and-shared-second`):
// (8) sem par do mesmo mob e estado, o eco e provado pelo original comum do cast, como ultimo
// recurso, e o rotulo de blast segue a ordem do log; (9) no segundo compartilhado com outro cast,
// a contiguidade do log tira do eco o que vem depois do bloco do outro cast; (10) o piso do
// overkill tira o que esta acima do nivel do eco. Sinteticos sobre `buildTurns`, com a tabela de
// mobs da sessao real `ms devoted` S0 (20/Out/2026, estancia Decay, death).
import assert from 'node:assert/strict';
import test from 'node:test';
import { UnifiedCorpus, createUnifiedContext } from '../tools/unified-corpus.mjs';

const corpus = new UnifiedCorpus();
const c = createUnifiedContext();
const engine = c.UnifiedClassificationEngine;
const pair = corpus.sessionsFor('ms devoted Server Log.txt', 'ms devoted Local Chat.txt')[0];
assert.ok(pair, 'ms devoted S0 must exist');
const server = engine.parseServerFacts(pair.sv.text);
const local = engine.parseLocalChat(pair.lc.text, { serverFacts: server });
const context = engine.buildContext(server, local, {
  mobModsPre: c.MOB_ELEMENT_MODS,
  mobModsPost: c.MOB_ELEMENT_MODS_POST_2026_06_16,
  useFloat16Mitigation: true, strictLeech: true, maxOriginal: 6000,
  deferLeechSetupInference: true,
});

// Originais death com prey (D-010a): templar 1340 -> {1048,1049}, 670 -> {524,525},
// 2000 -> {1563..1565}, 100 -> {78,79}; zealot 706 -> {523,524}, 705 -> {522,523},
// 600 -> {443..446}, 1415 -> {1048}, 1419 -> {1051}, 3000 -> {2222}.
const TEMPLAR = 'devoted radiant templar';
const ZEALOT = 'devoted radiant zealot';
const T = 50000;
let lastSeq = 0;
const hit = (ts, mob, dmg, extra = {}) => {
  const seq = ++lastSeq;
  return {
    id: 'x' + seq, kind: 'hit', seq, ts, mob, dmg, type: 'normal', realCrit: false, lowBlow: false,
    savageBlow: false, onslaught: false, perfectShot: false, isPrey: true, bountyTalisman: false,
    exposeWeakness: false, elementalAmplification: false, lifeLeech: 0, manaLeech: 0, overkill: false,
    ...extra,
  };
};
const cast = (ts, text) => ({ id: `c${ts}-${text}`, ts, text, type: 'attack', profile: engine.SPELL_PROFILES[text] });
const deathEcho = cast(T, 'exevo mort ora');
// Um hit 10 s antes tira a janela do blast do primeiro bloco de 2 s da sessao (T-007).
const lead = () => hit(T - 10, TEMPLAR, 150);
const stagesOf = hits => hits.map(h => h.multiStageStage || '-').join(',');

test('par cross-mob fecha: blast de um alvo prova o eco em outro mob', () => {
  const hits = [lead(), hit(T, TEMPLAR, 1340), hit(T + 1, ZEALOT, 706), hit(T + 1, ZEALOT, 706)];
  const turns = engine.buildTurns(hits, [deathEcho], context);
  assert.equal(stagesOf(hits), '-,primary,echo,echo');
  const origin = turns.find(t => t.hits.includes(hits[1]));
  assert.equal(origin.hits.length, 3, 'o eco fica no turno do blast');
});

test('par cross-mob que nao fecha nao prova nada', () => {
  const hits = [lead(), hit(T, TEMPLAR, 1340), hit(T + 1, ZEALOT, 600), hit(T + 1, ZEALOT, 600)];
  engine.buildTurns(hits, [deathEcho], context);
  assert.equal(stagesOf(hits), '-,-,-,-');
});

test('com par do mesmo mob o ultimo recurso nao e consultado', () => {
  // Nivel comum no blast (1049 e 1051, na tolerancia), e o `zealot 705` fecharia 1/2 com o
  // templar; mas o zealot do blast e a contraparte do mesmo mob e estado, e com ela nao fecha.
  const hits = [lead(), hit(T, TEMPLAR, 1340), hit(T, ZEALOT, 1419), hit(T + 1, ZEALOT, 705)];
  engine.buildTurns(hits, [deathEcho], context);
  assert.equal(stagesOf(hits), '-,-,-,-');
});

test('na borda da sessao o ultimo recurso nao roda', () => {
  const hits = [hit(T, TEMPLAR, 1340), hit(T + 1, ZEALOT, 706), hit(T + 1, ZEALOT, 706)];
  engine.buildTurns(hits, [deathEcho], context);
  assert.equal(stagesOf(hits), '-,-,-');
});

test('o blast provado pelo cross-mob segue a ordem do log, com dodge e overkill', () => {
  const hits = [
    lead(),
    hit(T, TEMPLAR, 1340),
    hit(T, ZEALOT, 0, { hazardDodge: true, zeroDamageDodge: true }),
    hit(T, TEMPLAR, 90, { overkill: true }),
    hit(T + 1, ZEALOT, 706),
    hit(T + 1, ZEALOT, 706),
  ];
  engine.buildTurns(hits, [deathEcho], context);
  assert.equal(stagesOf(hits), '-,primary,primary,primary,echo,echo');
});

// Segundo do eco compartilhado com o Hell's Core castado em T+1. Pares casados do mesmo mob:
// templar 1340/670 e zealot 1415/706; o `zealot 3000` nao fecha e fica com o outro cast.
const sharedSecond = echoSecond => {
  const hits = [lead(), hit(T, TEMPLAR, 1340), hit(T, ZEALOT, 1415), ...echoSecond()];
  engine.buildTurns(hits, [deathEcho, cast(T + 1, 'exevo gran mas flam')], context);
  return stagesOf(hits.slice(3));
};

test('pares casados antes do outro cast: o que vem depois dele nao e eco', () => {
  const echo = sharedSecond(() => [
    hit(T + 1, TEMPLAR, 670), hit(T + 1, ZEALOT, 706), hit(T + 1, ZEALOT, 3000), hit(T + 1, TEMPLAR, 100, { overkill: true }),
  ]);
  assert.equal(echo, 'echo,echo,-,-');
});

test('pares casados e outro cast intercalados: a ordem nao decide', () => {
  const echo = sharedSecond(() => [
    hit(T + 1, TEMPLAR, 670), hit(T + 1, ZEALOT, 3000), hit(T + 1, ZEALOT, 706), hit(T + 1, TEMPLAR, 100, { overkill: true }),
  ]);
  assert.equal(echo, 'echo,-,echo,echo');
});

test('overkill cujo menor original passa do nivel do eco nao e eco', () => {
  const echo = sharedSecond(() => [
    hit(T + 1, TEMPLAR, 670), hit(T + 1, ZEALOT, 3000), hit(T + 1, ZEALOT, 706), hit(T + 1, TEMPLAR, 2000, { overkill: true }),
  ]);
  assert.equal(echo, 'echo,-,echo,-');
});
