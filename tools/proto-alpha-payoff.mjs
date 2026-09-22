#!/usr/bin/env node
// PROTOTIPO JOGA-FORA (wayfinder #14). Quanto modelar o perk "alpha" ajudaria a
// familia-alvo do mapa #12?
//
// Alvo: turnos com reason `single_target_aa_all_action_without_positive_aa_evidence`.
// Para cada um, testa o corte que o canal de §4 tentaria (primeiro hit = AA, resto = spell)
// e classifica o SUFIXO em:
//   - suffix_clean      : sufixo ja fecha a exatidao same-mob  -> canal funcionaria hoje
//   - suffix_alpha_shape: sufixo viola COM a forma do alpha (cluster apertado + 1 outlier
//                         numa razao 1,05-1,15) -> alpha destravaria
//   - suffix_other      : sufixo viola com outra forma -> alpha NAO resolve
//   - no_group          : nao ha grupo same-mob com >=2 hits no sufixo -> canal inerte
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const ROOT = process.cwd();
const read = p => fs.readFileSync(p, 'utf8');
const ENGINE = ['js/stats.js', 'js/mob-element-mods.js', 'js/mob-element-mods-post-2026-06-16.js', 'js/mob-element-mods-post-2026-08-25.js', 'js/unified-session-context.js', 'js/unified-formulas.js', 'js/unified-parsing.js', 'js/unified-setup-inference.js', 'js/unified-validation.js', 'js/unified-turn-resolution.js', 'js/unified-classification-engine.js'];

const silent = { log() {}, warn() {}, error() {}, info() {}, debug() {} };
const ctx = { console: silent, Math, JSON, Array, Object, Number, String, Map, Set, isFinite, isNaN, parseInt, parseFloat, Date, Float32Array, Int32Array };
ctx.globalThis = ctx; ctx.window = ctx; vm.createContext(ctx);
for (const f of ENGINE) vm.runInContext(read(path.join(ROOT, f)), ctx, { filename: f });

const [svP, lcP] = process.argv.slice(2);
const u = ctx.UnifiedClassificationEngine.classifyUnified(read(svP), read(lcP), {
  mobModsPre: ctx.MOB_ELEMENT_MODS || null,
  mobModsPost: ctx.MOB_ELEMENT_MODS_POST_2026_06_16 || null,
  strictLeech: true, maxOriginal: 6000, useFloat16Mitigation: true,
});
if (u.error) { console.error('ERRO:', u.error); process.exit(1); }

const fmt = s => `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
const stateKey = h => [h.realCrit ? 'C' : '', h.onslaught ? 'O' : '', h.lowBlow ? 'L' : '', h.savageBlow ? 'S' : '', h.isPrey ? 'P' : '', h.exposeWeakness ? 'E' : '', h.omegaActive ? 'W' : '', h.multiStageStage || ''].join('');
const TARGET = 'single_target_aa_all_action_without_positive_aa_evidence';

const tally = { suffix_clean: 0, suffix_alpha_shape: 0, suffix_other: 0, no_group: 0 };
const alphaCases = [];
let total = 0;

for (const t of (u.turns || [])) {
  const comps = (t.components || []).filter(c => (c.reason || '') === TARGET);
  if (!comps.length) continue;
  total++;
  // ordem cronologica de todos os hits do turno
  const hits = [];
  for (const c of (t.components || [])) for (const h of (c.hits || [])) hits.push(h);
  hits.sort((a, b) => (a.ts - b.ts) || ((a.seq || 0) - (b.seq || 0)));
  const suffix = hits.slice(1).filter(h => !h.overkill && !h.zeroDamageDodge && !h.virtual);
  const groups = new Map();
  for (const h of suffix) {
    const p = h.evidence && h.evidence.physical;
    if (!p || !p.interval) continue;
    const k = h.mob + '|' + stateKey(h);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push({ h, iv: p.interval });
  }
  let worst = null;
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    let lo = -Infinity, hi = Infinity;
    for (const x of g) { lo = Math.max(lo, x.iv[0]); hi = Math.min(hi, x.iv[1]); }
    if (lo <= hi) continue;
    worst = g;
    break;
  }
  const anyGroup = [...groups.values()].some(g => g.length >= 2);
  if (!anyGroup) { tally.no_group++; continue; }
  if (!worst) { tally.suffix_clean++; continue; }
  // forma alpha? cluster apertado (<=1,5%) + 1 outlier em 1,05-1,15
  const cs = worst.map(x => (x.iv[0] + x.iv[1]) / 2).sort((a, b) => a - b);
  const n = cs.length;
  const tight = arr => arr.length >= 2 && (arr[arr.length - 1] - arr[0]) / arr[0] <= 0.015;
  let ratio = null;
  if (tight(cs.slice(0, n - 1))) { const m = cs.slice(0, n - 1).reduce((a, b) => a + b, 0) / (n - 1); ratio = cs[n - 1] / m; }
  else if (tight(cs.slice(1))) { const m = cs.slice(1).reduce((a, b) => a + b, 0) / (n - 1); ratio = m / cs[0]; }
  if (ratio != null && ratio >= 1.05 && ratio <= 1.15) {
    tally.suffix_alpha_shape++;
    alphaCases.push(`${fmt(t.ts)}  x${ratio.toFixed(3)}  ${worst[0].h.mob}  O=${cs.map(v => Math.round(v)).join('/')}`);
  } else {
    tally.suffix_other++;
  }
}

console.log(`turnos com reason=${TARGET}: ${total}\n`);
for (const [k, v] of Object.entries(tally)) console.log(`  ${k.padEnd(20)} ${String(v).padStart(4)}  (${(100 * v / total).toFixed(1)}%)`);
console.log('\ncasos com forma de alpha no sufixo:');
for (const c of alphaCases) console.log('  ' + c);
