#!/usr/bin/env node
// Histograma do DANO FINAL (o numero que aparece no log), por par / sessao / spell / mob.
// Sem reversao, sem modelo: so os valores observados.
// Uso: node tools/proto-damage-histogram.mjs [--json]
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

const FIXTURES = [
  { key: 'bastion',  sv: 'logs/bastion server log ek.txt', lc: 'logs/bastion local chat ek.txt' },
  { key: 'barrage',  sv: 'logs/barrage Server Log.txt',    lc: 'logs/barrage local chat.txt' },
  { key: 'ingol ed', sv: 'logs/ingol ed Server Log.txt',   lc: 'logs/ingol ed Local Chat.txt' },
  { key: 'dlc ms',   sv: 'logs/dlc ms Server Log.txt',     lc: 'logs/dlc ms Local Chat.txt' },
];

const groups = new Map();
for (const fx of FIXTURES) {
  const prs = pairsOf(splitSessions(read(fx.sv)), splitSessions(read(fx.lc)));
  prs.forEach((pair, si) => {
    const u = ctx.UnifiedClassificationEngine.classifyUnified(pair.sv.text, pair.lc.text, {
      mobModsPre: ctx.MOB_ELEMENT_MODS || null, mobModsPost: ctx.MOB_ELEMENT_MODS_POST_2026_06_16 || null,
      strictLeech: true, maxOriginal: 6000, useFloat16Mitigation: true,
    });
    if (u.error) { process.stderr.write(`${fx.key} S${si} ERRO ${u.error}\n`); return; }
    for (const t of u.turns || []) {
      if (t.status !== 'ok' && t.status !== 'resolved') continue;
      for (const c of t.components || []) {
        const label = c.comp === 'arrow' ? 'Auto ataque' : (c.actionLabel || null);
        if (!label) continue;
        const key = `${fx.key}|S${si}|${label}`;
        let g = groups.get(key);
        if (!g) {
          g = { fixture: fx.key, session: si, label, comp: c.comp,
            element: (c.action && c.action.profile && c.action.profile.element) || 'physical',
            plain: [], crit: [], overkill: [], byMob: new Map() };
          groups.set(key, g);
        }
        for (const h of c.hits || []) {
          const d = +h.dmg || 0;
          if (h.overkill) { g.overkill.push(d); continue; }
          const isCrit = !!(h.realCrit || h.onslaught || h.lowBlow || h.savageBlow);
          (isCrit ? g.crit : g.plain).push(d);
          if (!isCrit) {
            if (!g.byMob.has(h.mob)) g.byMob.set(h.mob, []);
            g.byMob.get(h.mob).push(d);
          }
        }
      }
    }
  });
}

const q = (a, p) => a.length ? a[Math.min(a.length-1, Math.floor(a.length*p))] : null;
function stat(vals) {
  const s = vals.slice().sort((a,b)=>a-b);
  if (!s.length) return null;
  const sum = s.reduce((a,b)=>a+b,0);
  return { n: s.length, min: s[0], max: s[s.length-1], span: s[s.length-1]-s[0],
    p25: q(s,0.25), med: q(s,0.5), p75: q(s,0.75), avg: +(sum/s.length).toFixed(1),
    distinct: new Set(s).size, values: s };
}

const rows = [];
for (const g of groups.values()) {
  const perMob = [];
  for (const [mob, vals] of g.byMob) perMob.push({ mob, ...stat(vals) });
  perMob.sort((a,b)=>b.n-a.n);
  rows.push({ fixture: g.fixture, session: g.session, label: g.label, comp: g.comp, element: g.element,
    plain: stat(g.plain), crit: stat(g.crit), overkillN: g.overkill.length, perMob });
}
rows.sort((a,b) => a.fixture.localeCompare(b.fixture) || a.session-b.session || (b.plain?.n||0)-(a.plain?.n||0));

if (process.argv.includes('--json')) { process.stdout.write(JSON.stringify(rows) + '\n'); }
else {
  let cur = '';
  for (const r of rows) {
    const head = `${r.fixture} S${r.session}`;
    if (head !== cur) { cur = head; process.stdout.write(`\n===== ${head} =====\n`); }
    const p = r.plain;
    if (!p) continue;
    process.stdout.write(`${r.label.padEnd(36)} n=${String(p.n).padStart(4)} dano=[${String(p.min).padStart(4)}..${String(p.max).padStart(5)}] med=${String(p.med).padStart(5)} avg=${String(p.avg).padStart(7)} distintos=${String(p.distinct).padStart(4)}  crit n=${String(r.crit?r.crit.n:0).padStart(3)} ok=${r.overkillN}\n`);
    if (process.argv.includes('--mobs')) for (const m of r.perMob)
      process.stdout.write(`      ${String(m.mob).padEnd(22)} n=${String(m.n).padStart(4)} [${String(m.min).padStart(4)}..${String(m.max).padStart(5)}] med=${String(m.med).padStart(5)} distintos=${String(m.distinct).padStart(4)}\n`);
  }
}
