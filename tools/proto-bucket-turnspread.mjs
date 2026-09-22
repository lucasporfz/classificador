#!/usr/bin/env node
// PROTOTIPO: para um par + rotulo, mostra por CAST (turno) o conjunto de originais O.
// Serve pra separar "dispersao dentro de um mesmo cast" (tiers/sublinhas) de
// "deriva entre casts" (setup/tabela).
// Uso: node tools/proto-bucket-turnspread.mjs "logs/sv.txt" "logs/lc.txt" "<rotulo>" [--session N] [--max N]
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
const fmt = s => `${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor((s%3600)/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;

const argv = process.argv.slice(2);
const si = argv.indexOf('--session') >= 0 ? +argv[argv.indexOf('--session') + 1] : 0;
const maxTurns = argv.indexOf('--max') >= 0 ? +argv[argv.indexOf('--max') + 1] : 25;
const pos = argv.filter((a, i) => !a.startsWith('--') && !String(argv[i-1] || '').startsWith('--'));
const [svP, lcP, want] = pos;

const pair = pairsOf(splitSessions(read(svP)), splitSessions(read(lcP)))[si];
const u = ctx.UnifiedClassificationEngine.classifyUnified(pair.sv.text, pair.lc.text, {
  mobModsPre: ctx.MOB_ELEMENT_MODS || null, mobModsPost: ctx.MOB_ELEMENT_MODS_POST_2026_06_16 || null,
  strictLeech: true, maxOriginal: 6000, useFloat16Mitigation: true,
});
let shown = 0;
for (const t of u.turns || []) {
  for (const c of t.components || []) {
    const label = c.comp === 'arrow' ? 'Auto-attack' : (c.actionLabel || '');
    if (!label.toLowerCase().includes(String(want).toLowerCase())) continue;
    const el = (c.action && c.action.profile && c.action.profile.element) || 'physical';
    const rows = [];
    for (const h of c.hits || []) {
      const ev = h.evidence; if (!ev) continue;
      let o = null;
      if (el !== 'physical' && el !== 'weapon') {
        const e = ev.elemental && ev.elemental[el];
        o = e && e.known && (e.originals || []).length === 1 ? e.originals[0] : null;
      } else if (ev.physical && ev.physical.interval) {
        o = Math.round((ev.physical.interval[0] + ev.physical.interval[1]) / 2);
      }
      rows.push(`${h.mob.slice(0,14)}:${o == null ? '?' : o}${h.realCrit ? 'C' : ''}${h.overkill ? 'K' : ''}`);
    }
    process.stdout.write(`${fmt(t.ts)} ${label} n=${(c.hits||[]).length}\n   ${rows.join('  ')}\n`);
    if (++shown >= maxTurns) process.exit(0);
  }
}
