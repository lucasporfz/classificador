#!/usr/bin/env node
// PROTOTIPO (descartavel): confronta o histograma de dano-original observado nos logs
// com o modelo de "buckets" do tibiatools (n de sorteios discretos por spell).
//
// Modelo: valor_j = ROUND(step * (P - B/2 + j)), j = 0..B
//   step  = X / P  (X = dano medio "core"),  P = power,  B = buckets
//   => B+1 valores distintos, espacados por ~step, largura total = B*step.
//
// Uso: node tools/proto-bucket-histogram.mjs [--json] [--values]
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

const SPELLS = JSON.parse(read('reports/tibiatools-spells.json'));
const norm = s => String(s || '').toLowerCase().replace(/\s*\(.*\)\s*$/, '').replace(/\s+rune$/, '').replace(/'/g, "'").trim();
function bucketsFor(label) {
  const n = norm(label);
  const hits = SPELLS.filter(s => norm(s.displayName || s.name) === n);
  if (!hits.length) return null;
  // Estagios (grenade/burst/exec throw/beam sides) compartilham buckets; pega o maior.
  let best = hits[0];
  for (const s of hits) if (s.buckets > best.buckets) best = s;
  return best;
}

const HEADER_RE = /^Channel .+ saved \w+ (\w+) +(\d+) (\d+:\d+:\d+) (\d{4})/;
const MONTHS = { Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11,Sept:8 };
function splitSessions(text) {
  const out = []; let cur = null; const pre = [];
  for (const line of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const m = line.match(HEADER_RE);
    if (m) {
      if (cur) { cur.text = cur.lines.join('\n'); out.push(cur); }
      const [, mon, day, time, year] = m; const [h, mi, s] = time.split(':').map(Number);
      cur = { header: line.trim(), year:+year, month: MONTHS[mon] ?? -1, day:+day, saveSec: h*3600+mi*60+s, lines:[line] };
    } else if (cur) cur.lines.push(line);
    else pre.push(line);
  }
  if (cur) { cur.text = cur.lines.join('\n'); out.push(cur); }
  if (!out.length) out.push({ header:'', year:0, month:0, day:0, saveSec:0, lines:pre, text:pre.join('\n') });
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

// Periodograma: o reticulado v ~ F + step*K e periodico com periodo `step`.
// Score(s) = |media de exp(2*pi*i*v/s)|. Harmonicos caem em s/k (menores), entao o
// MAIOR s com score alto e o passo real. Busca limitada a s >= span/B (nao pode haver
// mais de B intervalos) e s <= 60.
function fitStep(values, B) {
  const vs = Array.from(new Set(values)).sort((a,b)=>a-b);
  if (vs.length < 4 || !(B > 0)) return null;
  const span = vs[vs.length-1] - vs[0];
  const lo = Math.max(span / B, 0.5);
  let best = { s: null, score: -1 };
  const scored = [];
  const hi = Math.max(Math.min(120, lo * 6), lo + 1);
  for (let s = lo; s <= hi; s += 0.002) {
    let re = 0, im = 0;
    for (const v of vs) { const a = 2 * Math.PI * v / s; re += Math.cos(a); im += Math.sin(a); }
    const score = Math.hypot(re, im) / vs.length;
    scored.push([s, score]);
    if (score > best.score) best = { s, score };
  }
  // maior s cujo score chega a 70% do pico (evita cair num harmonico s0/k)
  let chosen = best;
  for (let i = scored.length - 1; i >= 0; i--) {
    if (scored[i][1] >= best.score * 0.7) { chosen = { s: scored[i][0], score: scored[i][1] }; break; }
  }
  return { step: +chosen.s.toFixed(3), score: +chosen.score.toFixed(3), span, bObs: +(span / chosen.s).toFixed(1) };
}

// Niveis distintos: agrupa valores separados por menos de `tol` (residuo da reversao).
function levels(values, tol) {
  const vs = Array.from(new Set(values)).sort((a,b)=>a-b);
  let n = 0, last = -Infinity;
  for (const v of vs) { if (v - last > tol) n++; last = v; }
  return n;
}

const groups = new Map();
function add(key, meta, o, mob) {
  let g = groups.get(key);
  if (!g) { g = Object.assign({}, meta, { vals: [], mobs: new Map(), byMob: new Map() }); groups.set(key, g); }
  g.vals.push(o);
  g.mobs.set(mob, (g.mobs.get(mob)||0)+1);
  if (!g.byMob.has(mob)) g.byMob.set(mob, []);
  g.byMob.get(mob).push(o);
  return g;
}

for (const fx of FIXTURES) {
  const svS = splitSessions(read(fx.sv)), lcS = splitSessions(read(fx.lc));
  const prs = pairsOf(svS, lcS);
  prs.forEach((pair, si) => {
    const u = ctx.UnifiedClassificationEngine.classifyUnified(pair.sv.text, pair.lc.text, {
      mobModsPre: ctx.MOB_ELEMENT_MODS || null, mobModsPost: ctx.MOB_ELEMENT_MODS_POST_2026_06_16 || null,
      strictLeech: true, maxOriginal: 6000, useFloat16Mitigation: true,
    });
    if (u.error) { process.stderr.write(`${fx.key} S${si} ERRO ${u.error}\n`); return; }
    for (const t of u.turns || []) {
      if (t.status !== 'ok' && t.status !== 'resolved') continue;
      for (const c of t.components || []) {
        const label = c.comp === 'arrow' ? 'Auto-attack' : (c.actionLabel || null);
        if (!label) continue;
        const el = (c.action && c.action.profile && c.action.profile.element) || (c.comp === 'arrow' ? 'weapon' : null);
        const key = `${fx.key}|S${si}|${label}`;
        for (const h of c.hits || []) {
          if (h.overkill) continue;
          if (h.realCrit || h.onslaught || h.lowBlow || h.savageBlow) continue;
          const ev = h.evidence; if (!ev) continue;
          if (el && el !== 'weapon' && el !== 'physical') {
            const e = ev.elemental && ev.elemental[el];
            if (!e || !e.known || (e.originals||[]).length !== 1) continue;
            add(key, { fixture: fx.key, session: si, label, element: el, axis: 'elemental' }, e.originals[0], h.mob);
          } else {
            const p = ev.physical;
            if (!p || !p.known || !p.interval) continue;
            const g = add(key, { fixture: fx.key, session: si, label, element: 'physical', axis: 'physical' },
              Math.round((p.interval[0]+p.interval[1])/2), h.mob);
            (g.halfWidths || (g.halfWidths = [])).push((p.interval[1]-p.interval[0])/2);
          }
        }
      }
    }
  });
}

const rows = [];
for (const [key, g] of groups) {
  const spec = bucketsFor(g.label);
  const vs = g.vals.slice().sort((a,b)=>a-b);
  const distinct = Array.from(new Set(vs)).sort((a,b)=>a-b);
  const B = spec ? spec.buckets : null;
  const fit = g.axis === 'elemental' && B ? fitStep(distinct, B) : null;
  const perMob = [];
  for (const [mob] of g.mobs) {
    const mv = g.byMob.get(mob);
    const md = Array.from(new Set(mv)).sort((a,b)=>a-b);
    perMob.push({ mob, n: mv.length, distinct: md.length, min: md[0], max: md[md.length-1], span: md[md.length-1]-md[0],
      fit: g.axis === 'elemental' && B ? fitStep(md, B) : null });
  }
  perMob.sort((a,b)=>b.n-a.n);
  rows.push({
    key, fixture: g.fixture, session: g.session, label: g.label, element: g.element, axis: g.axis,
    spec: spec ? { power: spec.power, skillFactor: spec.skillFactor, buckets: spec.buckets, rounding: spec.rounding } : null,
    n: vs.length, distinct: distinct.length, min: vs[0], max: vs[vs.length-1], span: vs[vs.length-1]-vs[0],
    levels2: levels(distinct, 2), mobs: g.mobs.size, fit, perMob,
    halfWidth: g.halfWidths ? +(g.halfWidths.reduce((a,b)=>a+b,0)/g.halfWidths.length).toFixed(1) : null,
    values: distinct,
  });
}
rows.sort((a,b) => a.fixture.localeCompare(b.fixture) || a.session-b.session || b.n-a.n);

if (process.argv.includes('--json')) {
  process.stdout.write(JSON.stringify(rows, null, 1) + '\n');
} else {
  let cur = '';
  for (const r of rows) {
    const head = `${r.fixture} S${r.session}`;
    if (head !== cur) { cur = head; process.stdout.write(`\n===== ${head} =====\n`); }
    const B = r.spec ? r.spec.buckets : null;
    process.stdout.write(`${r.label.padEnd(34)} ${r.axis.padEnd(9)} B=${String(B == null ? '?' : B).padStart(4)} hits=${String(r.n).padStart(4)} niveis=${String(r.levels2).padStart(4)}/${String(B == null ? '?' : B+1).padEnd(4)} O=[${r.min}..${r.max}] span=${String(r.span).padStart(4)} mobs=${r.mobs}`
      + (r.fit ? ` | step=${r.fit.step} B_obs=${r.fit.bObs} score=${r.fit.score}` : '')
      + (r.halfWidth != null ? ` | +-armadura=${r.halfWidth}` : '')
      + '\n');
    if (process.argv.includes('--mobs')) for (const m of r.perMob)
      process.stdout.write(`      ${String(m.mob).padEnd(22)} n=${String(m.n).padStart(4)} O=[${m.min}..${m.max}] span=${String(m.span).padStart(4)}${m.fit ? ` step=${m.fit.step} B_obs=${m.fit.bObs}` : ''}\n`);
    if (process.argv.includes('--values')) process.stdout.write(`    ${r.values.join(' ')}\n`);
  }
}
