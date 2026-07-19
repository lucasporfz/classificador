#!/usr/bin/env node
// crit-bucket-validate.mjs — prova (read-only) do estimador de crítico por-componente
// (UnifiedClassificationEngine.inferCritByComponent). Rotula os hits com o classificador
// de PRODUÇÃO (turnTrace) só para montar os buckets — o estimador em si é do motor Unified.
// Confere que a razão mean(crit)/mean(noncrit) reproduz os valores medidos por sessão.
// Uso: node tools/crit-bucket-validate.mjs
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path';
const ROOT = process.cwd();
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

function unifiedEngine() {
  const ctx = { console: { log() {}, warn() {}, error() {} }, Math, JSON, Array, Object, Number, String, Map, Set, isFinite, isNaN, parseInt, parseFloat, Date, Float32Array, Int32Array };
  ctx.globalThis = ctx; ctx.window = ctx; vm.createContext(ctx);
  for (const f of ['js/stats.js', 'js/mob-element-mods.js', 'js/mob-element-mods-post-2026-06-16.js', 'js/unified-formulas.js', 'js/unified-parsing.js', 'js/unified-setup-inference.js', 'js/unified-validation.js', 'js/unified-turn-resolution.js', 'js/unified-classification-engine.js'])
    vm.runInContext(read(f), ctx, { filename: f });
  return ctx.UnifiedClassificationEngine;
}
function prodEngine() {
  const ctx = { console: { log() {}, warn() {}, error() {} }, Math, JSON, Array, Object, Number, String, Map, Set, isFinite, isNaN, parseInt, parseFloat, Date, Float32Array, Int32Array };
  ctx.globalThis = ctx; ctx.window = ctx; vm.createContext(ctx);
  for (const f of ['js/experimental-classification-core.js', 'js/stats.js', 'js/mob-element-mods.js', 'js/rp-grenade-peak.js', 'js/parser-rp-helpers.js', 'js/classifier-parser.js', 'js/classifier.js'])
    vm.runInContext(read(f), ctx, { filename: f });
  return ctx;
}
function ss(t) { const re = /^Channel .+ saved /; const s = []; let c = null; for (const l of t.replace(/^﻿/, '').split(/\r?\n/)) { if (re.test(l)) { if (c) s.push(c); c = { lines: [l] }; } else if (c) c.lines.push(l); } if (c) s.push(c); if (!s.length) s.push({ lines: t.split(/\r?\n/) }); return s.map(x => x.lines.join('\n')); }

// rotula hits com o classificador de produção e devolve [{compKey, mob, dmg, realCrit, overkill, isPrey}]
function labeledHits(prod, svT, lcT) {
  const res = prod.classifyWithLocalChat(svT, lcT, { trace: true });
  const out = [];
  for (const t of res.turnTrace || []) {
    const keyOf = c => c === 'spell' ? ('spell:' + (t.spell || '?')) : c === 'grenade' ? ('grenade:' + (t.gren || '?')) : c === 'rune' ? ('rune:' + (t.rune || '?')) : 'physical';
    for (const l of t.lines || []) out.push({ compKey: keyOf(l.comp), mob: l.mob, dmg: l.dmg, realCrit: !!l.realCrit, overkill: !!l.ok, isPrey: !!l.isPrey });
  }
  return out;
}

const CASES = [
  ['barrage', 'logs/barrage Server Log.txt', 'logs/barrage local chat.txt', '19:00:38',
    { 'physical': [1.55, 1.70], 'spell:exevo mas san': [1.90, 2.00], 'spell:exori dir moe': [1.60, 1.72] }],
  ['bastion', 'logs/bastion server log ek.txt', 'logs/bastion local chat ek.txt', '15:20:27',
    { 'spell:exori gran': [1.45, 1.56], 'spell:exori': [1.50, 1.62] }],
  ['darklight e vemiath', 'logs/darklight e vemiath server log.txt', 'logs/darklight e vemiath Local Chat.txt', '23:23:20',
    { 'physical': [1.78, 1.90], 'spell:exevo mas san': [1.92, 2.00], 'rune:great fireball': [1.70, 1.80], 'grenade:exevo tempo mas san': [1.90, 2.00] }],
];

const E = unifiedEngine();
const prod = prodEngine();
let pass = 0, fail = 0;
for (const [label, svF, lcF, tsMatch, expect] of CASES) {
  const svAll = ss(read(svF)), lcAll = ss(read(lcF));
  let svT = svAll[0], lcT = lcAll[0];
  for (let i = 0; i < svAll.length; i++) { if (new RegExp('^' + tsMatch, 'm').test(svAll[i])) { svT = svAll[i]; lcT = lcAll[Math.min(i, lcAll.length - 1)]; break; } }
  const est = E.inferCritByComponent(labeledHits(prod, svT, lcT));
  console.log(`\n=== ${label} ===  fallback=${est.fallback?.toFixed(3)}`);
  for (const [key, ev] of Object.entries(est.evidence).sort((a, b) => (b[1].noncrit + b[1].crit) - (a[1].noncrit + a[1].crit))) {
    const exp = expect[key];
    let mark = ' ';
    if (exp) { const ok = ev.multiplier >= exp[0] && ev.multiplier <= exp[1]; mark = ok ? 'PASS' : 'FAIL'; if (ok) pass++; else fail++; }
    console.log(`  ${mark.padStart(4)} ${key.padEnd(30)} crit=${ev.multiplier.toFixed(3)} mobs=${ev.mobs} spread=${ev.spread.toFixed(3)} nNC=${ev.noncrit} nCR=${ev.crit}${exp ? ` (esperado ${exp[0]}–${exp[1]})` : ''}`);
  }
}
console.log(`\n${pass}/${pass + fail} asserts de crítico por-componente ok` + (fail ? `  (${fail} falha(s))` : ''));
process.exit(fail ? 1 : 0);
