// M-036/D-010c: a testemunha de charm precisa ser comparada contra o esperado do estado
// de pierce REAL da linha observada. Antes desta correcao os detectores montavam um hit
// sintetico com apenas `exposeWeakness`, entao toda linha com `active elemental
// amplification` era comparada contra o esperado sem amplification. O residuo
// (`effectiveMod` com amp / `effectiveMod` sem amp) virava "bonus de classe de bestiario".
//
// Caso-prova: `uhax 3` S1, `darklight matter`, `enflame charm` (fire). O log traz as duas
// populacoes no mesmo mob e no mesmo charm, e cada uma bate a sua variante do modelo.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import { UnifiedCorpus } from '../tools/unified-corpus.mjs';

const ENGINE_FILES = [
  'js/stats.js',
  'js/mob-element-mods.js',
  'js/mob-element-mods-post-2026-06-16.js',
  'js/unified-session-context.js', 'js/unified-formulas.js',
  'js/unified-parsing.js',
  'js/unified-setup-inference.js',
  'js/unified-validation.js',
  'js/unified-turn-resolution.js',
  'js/unified-classification-engine.js',
];

const silent = { log() {}, warn() {}, error() {}, info() {}, debug() {} };
const context = {
  console: silent, Math, JSON, Array, Object, Number, String, Map, WeakMap, Set,
  isFinite, isNaN, parseInt, parseFloat, Date, Float32Array, Int32Array,
};
context.globalThis = context;
context.window = context;
vm.createContext(context);
for (const file of ENGINE_FILES) {
  vm.runInContext(fs.readFileSync(path.resolve(file), 'utf8'), context, { filename: file });
}

// A cache persistente devolve projecao reduzida (sem os setups inferidos); desligada.
const corpus = new UnifiedCorpus({ cacheEnabled: false, persistentCacheDir: null });
const pairs = corpus.sessionsFor('uhax 3 server log ed.txt', 'uhax 3 local chat ed.txt');
assert.ok(pairs && pairs[1], 'sessao S1 de uhax 3 nao encontrada');
const result = corpus.classify('uhax 3 server log ed.txt', 'uhax 3 local chat ed.txt', pairs[1], { profile: 'gabarito' });
assert.ok(result && !result.error, `motor falhou: ${result && result.error}`);

// --- 1. As quatro variantes do modelo de charm --------------------------------
const F = context.UnifiedFormulas;
const mods = context.MOB_ELEMENT_MODS_POST_2026_06_16['darklight matter'];
assert.equal(mods.hitpoints, 30150, 'hitpoints de darklight matter mudou; caso-prova precisa ser refeito');
assert.equal(mods.fireDmgMod, 1.25, 'fireDmgMod de darklight matter mudou');
const mit = F.mitigationMultiplier(mods, null);
const expectedFor = pierce => mods.hitpoints * 0.05 * mit * F.effectiveMod(+mods.fireDmgMod, pierce);

const VARIANTS = [
  { label: 'sem EW, amp 0%', pierce: 0, observed: 1785 },
  { label: 'sem EW, amp 16%', pierce: 0.16, observed: 1900 },
  { label: 'com EW, amp 0%', pierce: 0.08, observed: 1842 },
  { label: 'com EW, amp 16%', pierce: 0.24, observed: 1957 },
];
for (const variant of VARIANTS) {
  const expected = expectedFor(variant.pierce);
  assert.ok(
    Math.abs(expected - variant.observed) <= 1,
    `${variant.label}: esperado ${expected.toFixed(2)} deveria bater o observado ${variant.observed}`,
  );
}

// --- 2. As duas populacoes existem mesmo no log -------------------------------
const events = (result.facts && result.facts.server && result.facts.server.events) || [];
const enflame = events.filter(event => event
  && event.kind === 'charm'
  && event.dmg > 0
  && event.mob === 'darklight matter'
  && /enflame charm/i.test(event.rawLine || ''));
const tally = {};
for (const event of enflame) {
  const ew = /expose weakness/i.test(event.rawLine || '');
  const amp = /active elemental amplification/i.test(event.rawLine || '');
  const key = `${ew ? 'ew' : 'noew'}|${amp ? 'amp' : 'noamp'}`;
  (tally[key] || (tally[key] = [])).push(event.dmg);
}
const modeOf = key => {
  const counts = new Map();
  for (const value of tally[key] || []) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0][0];
};
assert.ok((tally['noew|noamp'] || []).length >= 3, 'faltam linhas sem EW e sem amplification');
assert.ok((tally['noew|amp'] || []).length >= 3, 'faltam linhas sem EW e com amplification');
assert.ok((tally['ew|noamp'] || []).length >= 3, 'faltam linhas com EW e sem amplification');
assert.ok((tally['ew|amp'] || []).length >= 3, 'faltam linhas com EW e com amplification');
assert.equal(modeOf('noew|noamp'), 1785, 'linha sem EW e sem amplification deveria valer 1785');
assert.equal(modeOf('noew|amp'), 1900, 'linha sem EW e com amplification deveria valer 1900');
assert.equal(modeOf('ew|noamp'), 1842, 'linha com EW e sem amplification deveria valer 1842');
assert.equal(modeOf('ew|amp'), 1957, 'linha com EW e com amplification deveria valer 1957');

// --- 3. O bonus fantasma de classe nao pode ser inferido ----------------------
const bestiary = result.bestiaryClassDamageBonus || {};
assert.equal(bestiary.bonus || 0, 0,
  `uhax 3 S1 nao pode inferir bonus de classe (got ${JSON.stringify({ bonus: bestiary.bonus, class: bestiary.class })}); os ~6% sao a amplification que o esperado ignorava`);

// --- 4. Controles: modelo do charm e Bounty permanecem exatos -----------------
const medianOf = values => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};
const controlFraction = (mob, charm, element, ew, bounty) => {
  const rows = events.filter(event => event
    && event.kind === 'charm'
    && event.dmg > 0
    && event.mob === mob
    && new RegExp(`${charm} charm`, 'i').test(event.rawLine || '')
    && (/expose weakness/i.test(event.rawLine || '') === ew)
    && (!!event.bountyTalisman === bounty));
  if (rows.length < 3) return null;
  const entry = context.MOB_ELEMENT_MODS_POST_2026_06_16[mob];
  const mitigation = F.mitigationMultiplier(entry, null);
  const key = { earth: 'earthDmgMod', physical: 'physicalDmgMod', fire: 'fireDmgMod' }[element];
  const mod = F.effectiveMod(+entry[key], ew ? 0.08 : 0);
  return medianOf(rows.map(row => row.dmg)) / (entry.hitpoints * mitigation * mod);
};

const pillarNoBounty = controlFraction('walking pillar', 'poison', 'earth', false, false);
assert.ok(pillarNoBounty !== null && Math.abs(pillarNoBounty - 0.05) < 0.0005,
  `walking pillar sem Bounty deveria ficar em 5,000% da vida; got ${(pillarNoBounty * 100).toFixed(3)}%`);
const sourceControl = controlFraction('darklight source', 'wound', 'physical', false, false);
assert.ok(sourceControl !== null && Math.abs(sourceControl - 0.05) < 0.0005,
  `darklight source deveria ficar em 5,00% da vida; got ${(sourceControl * 100).toFixed(3)}%`);
const pillarBounty = controlFraction('walking pillar', 'poison', 'earth', false, true);
assert.ok(pillarBounty !== null && Math.abs(pillarBounty / 0.05 - 1.1275) < 0.005,
  `walking pillar com Bounty deveria ficar em 1,127x; got ${(pillarBounty / 0.05).toFixed(4)}x`);

// --- 5. O bloco de Great Fireball volta a fechar ------------------------------
const targetTs = (13 * 3600) + (33 * 60) + 17;
const turn = (result.turns || []).find(item => item.ts === targetTs);
assert.ok(turn, 'turno 13:33:17 de uhax 3 S1 nao encontrado');
const rune = (turn.components || []).find(component => component.comp === 'rune');
assert.ok(rune, 'componente de runa nao encontrado em 13:33:17');
const matterHit = (rune.hits || []).find(hit => hit.mob === 'darklight matter' && hit.dmg === 975);
assert.ok(matterHit, 'hit 975 de darklight matter nao encontrado');
const fire = matterHit.evidence && matterHit.evidence.elemental && matterHit.evidence.elemental.fire;
assert.ok(fire && fire.originals && fire.originals.length, 'sem originais de fire no hit alvo');
assert.equal(fire.post, 1, `darklight matter nao pode receber postMultiplier de bestiario; got ${fire.post}`);
// D-010a (round-creature-resistance-step, 08/Out/2026): com o passo do mod em ROUND os 9 hits do
// bloco caem todos em 752 exato; sob o CEIL anterior o original comum era 751.
assert.ok(fire.originals.includes(752),
  `original de fire deveria conter 752 (alinhado com os demais mobs do cast); got [${fire.originals.join(',')}]`);
assert.equal(JSON.stringify(rune.deterministic && rune.deterministic.intersection), '[752]',
  'o bloco de Great Fireball fecha no original comum 752');
assert.notEqual(rune.deterministic && rune.deterministic.reason, 'elemental_cluster_span_too_wide',
  'o bloco de Great Fireball deveria fechar sem elemental_cluster_span_too_wide');

console.log('unified charm witness pierce state: OK');
