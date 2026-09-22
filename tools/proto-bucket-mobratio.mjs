#!/usr/bin/env node
// PROTOTIPO: dentro de CADA cast de um componente, compara o original O entre mobs.
// Se o motor estivesse calibrado e a spell rolasse uma vez por cast, O seria IGUAL
// em todos os mobs. Razoes fixas entre mobs => offset sistematico de tabela.
// Uso: node tools/proto-bucket-mobratio.mjs "logs/sv.txt" "logs/lc.txt" "<rotulo>" [--session N]
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const ROOT = process.cwd();
const read = p => fs.readFileSync(p, 'utf8');
const silent = { log(){}, warn(){}, error(){}, info(){}, debug(){} };
const ctx = { console: silent, Math, JSON, Array, Object, Number, String, Map, Set, WeakMap, isFinite, isNaN, parseInt, parseFloat, Date, Float32Array, Int32Array };
ctx.globalThis = ctx; ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['js/stats.js','js/mob-element-mods.js','js/mob-element-mods-post-2026-06-16.js', 'js/mob-element-mods-post-2026-08-25.js','js/unified-session-context.js', 'js/unified-formulas.js','js/unified-parsing.js','js/unified-setup-inference.js','js/unified-validation.js','js/unified-turn-resolution.js','js/unified-classification-engine.js'])
  vm.runInContext(read(path.join(ROOT, f)), ctx, { filename: f });

const HEADER_RE = /^Channel .+ saved \w+ (\w+) +(\d+) (\d+:\d+:\d+) (\d{4})/;
const MONTHS = { Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11,Sept:8 };
function splitSessions(text) {
  const out = []; let cur = null; const pre = [];
  for (const line of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const m = line.match(HEADER_RE);
    if (m) { if (cur) { cur.text = cur.lines.join('\n'); out.push(cur); }
      const [, mon, day, time, year] = m; const [h, mi, s] = time.split(':').map(Number);
      cur = { header: line.trim(), year:+year, month: MONTHS[mon] ?? -1, day:+day, saveSec: h*3600+mi*60+s, lines:[line] };
    } else if (cur) cur.lines.push(line); else pre.push(line);
  }
  if (cur) { cur.text = cur.lines.join('\n'); out.push(cur); }
  if (!out.length) out.push({ header:'', text: pre.join('\n') });
  return out;
}
function pairsOf(svAll, lcAll) {
  if (svAll.length === 1 && lcAll.length === 1) return [{ sv: svAll[0], lc: lcAll[0] }];
  const out = [];
  for (const sv of svAll) {
    if (!sv.header) continue;
    const c = lcAll.filter(lc => lc.header && lc.year===sv.year && lc.month===sv.month && lc.day===sv.day && Math.abs(lc.saveSec-sv.saveSec) <= 3600);
    if (!c.length) continue;
    c.sort((a,b) => Math.abs(a.saveSec-sv.saveSec) - Math.abs(b.saveSec-sv.saveSec));
    out.push({ sv, lc: c[0] });
  }
  return out;
}

const argv = process.argv.slice(2);
const si = argv.indexOf('--session') >= 0 ? +argv[argv.indexOf('--session') + 1] : 0;
const pos = argv.filter((a, i) => !a.startsWith('--') && !String(argv[i-1] || '').startsWith('--'));
const [svP, lcP, want] = pos;

const pair = pairsOf(splitSessions(read(svP)), splitSessions(read(lcP)))[si];
const u = ctx.UnifiedClassificationEngine.classifyUnified(pair.sv.text, pair.lc.text, {
  mobModsPre: ctx.MOB_ELEMENT_MODS || null, mobModsPost: ctx.MOB_ELEMENT_MODS_POST_2026_06_16 || null,
  strictLeech: true, maxOriginal: 6000, useFloat16Mitigation: true,
});

// Para cada cast: pega o MAIOR O de cada mob (tier de cima) e acumula razoes par a par.
const ratios = new Map();
let casts = 0;
for (const t of u.turns || []) {
  for (const c of t.components || []) {
    const label = c.comp === 'arrow' ? 'Auto-attack' : (c.actionLabel || '');
    if (!label.toLowerCase().includes(String(want).toLowerCase())) continue;
    const el = (c.action && c.action.profile && c.action.profile.element) || 'physical';
    if (el === 'physical' || el === 'weapon') continue;
    const top = new Map();
    for (const h of c.hits || []) {
      if (h.overkill || h.realCrit || h.onslaught) continue;
      const e = h.evidence && h.evidence.elemental && h.evidence.elemental[el];
      if (!e || !e.known || (e.originals || []).length !== 1) continue;
      const o = e.originals[0];
      if (!top.has(h.mob) || o > top.get(h.mob)) top.set(h.mob, o);
    }
    if (top.size < 2) continue;
    casts++;
    const ms = Array.from(top.keys()).sort();
    for (let i = 0; i < ms.length; i++) for (let j = i+1; j < ms.length; j++) {
      const k = `${ms[i]} / ${ms[j]}`;
      if (!ratios.has(k)) ratios.set(k, []);
      ratios.get(k).push(top.get(ms[i]) / top.get(ms[j]));
    }
  }
}
console.log(`casts com >=2 mobs: ${casts}`);
const out = [];
for (const [k, v] of ratios) {
  if (v.length < 5) continue;
  const s = v.slice().sort((a,b)=>a-b);
  const med = s[Math.floor(s.length/2)];
  out.push({ k, n: v.length, med, p10: s[Math.floor(s.length*0.1)], p90: s[Math.floor(s.length*0.9)] });
}
out.sort((a,b)=>b.n-a.n);
for (const r of out) console.log(`${r.k.padEnd(46)} n=${String(r.n).padStart(4)} mediana=${r.med.toFixed(4)}  p10..p90=${r.p10.toFixed(3)}..${r.p90.toFixed(3)}`);
