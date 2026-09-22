#!/usr/bin/env node
// Quantos buckets os logs mostram, por spell, em hits do MESMO ESTADO.
//
// "Mesmo estado" = mesma criatura + mesmo conjunto de flags que mudam o dano final
// (crit / low blow / savage / onslaught / prey / perfect shot / bounty talisman /
// expose weakness / elemental amplification / utevo grav san). Dentro de um estado,
// o dano final e funcao monotona do sorteio, entao o numero de valores distintos e
// EXATAMENTE o numero de buckets sorteados. Overkill fica fora (dano truncado).
//
// Uso: node tools/proto-bucket-samestate.mjs [--min N] [--json]
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
const norm = s => String(s || '').toLowerCase().replace(/\s*\(.*\)\s*$/, '').replace(/\s+rune$/, '').trim();
function specFor(label) {
  const n = norm(label);
  const hits = SPELLS.filter(s => norm(s.displayName || s.name) === n);
  if (!hits.length) return null;
  const stages = hits.filter(s => s.additionalDamageMultiplier && s.additionalDamageMultiplier !== 1).length;
  let best = hits[0];
  for (const s of hits) if (s.buckets > best.buckets) best = s;
  return { buckets: best.buckets, power: best.power, stages };
}

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

const FLAGS = ['realCrit','lowBlow','savageBlow','onslaught','perfectShot','isPrey','bountyTalisman','exposeWeakness','elementalAmplification'];

// spell -> Map(stateKey -> {n, values:Set, min, max, flags})
const spells = new Map();

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
        const sk = `${fx.key}|S${si}|${label}`;
        if (!spells.has(sk)) spells.set(sk, { fixture: fx.key, session: si, label, comp: c.comp, states: new Map(), total: 0, dropped: 0 });
        const g = spells.get(sk);
        for (const h of c.hits || []) {
          if (h.overkill) { g.dropped++; continue; }
          g.total++;
          const flags = FLAGS.filter(f => !!h[f]);
          if (c.gravSanActive) flags.push('gravSan');
          const key = `${h.mob}||${flags.join(',')}`;
          let st = g.states.get(key);
          if (!st) { st = { mob: h.mob, flags, values: new Set(), n: 0 }; g.states.set(key, st); }
          st.n++; st.values.add(+h.dmg || 0);
        }
      }
    }
  });
}

const MIN = process.argv.indexOf('--min') >= 0 ? +process.argv[process.argv.indexOf('--min') + 1] : 30;

const rows = [];
for (const g of spells.values()) {
  const spec = specFor(g.label);
  const sts = Array.from(g.states.values()).sort((a, b) => b.n - a.n);
  const eligible = sts.filter(s => s.n >= MIN);
  const top = eligible.length ? eligible.reduce((a, s) => (s.values.size > a.values.size ? s : a)) : null;
  const sum = eligible.reduce((a, s) => a + s.n, 0);
  rows.push({
    fixture: g.fixture, session: g.session, label: g.label, comp: g.comp,
    B: spec ? spec.buckets : null, prev: spec ? spec.buckets + 1 : null, stages: spec ? spec.stages : 0,
    hits: g.total, overkill: g.dropped,
    states: sts.length, eligible: eligible.length, eligibleHits: sum,
    topN: top ? top.n : null, topDistinct: top ? top.values.size : null,
    topMob: top ? top.mob : null, topFlags: top ? (top.flags.join('+') || 'limpo') : null,
    topMin: top ? Math.min(...top.values) : null, topMax: top ? Math.max(...top.values) : null,
    maxDistinctAll: sts.length ? Math.max(...sts.map(s => s.values.size)) : 0,
  });
}
rows.sort((a, b) => a.fixture.localeCompare(b.fixture) || a.session - b.session || b.hits - a.hits);

if (process.argv.includes('--json')) { process.stdout.write(JSON.stringify(rows, null, 1) + '\n'); process.exit(0); }

console.log(`Buckets observados = valores de dano distintos dentro de um mesmo estado`);
console.log(`(estado = mesma criatura + mesmas flags: ${FLAGS.join('/')} + grav san). Overkill fora.`);
console.log(`Grupo reportado = o estado com MAIS valores distintos entre os que tem >= ${MIN} hits.\n`);
let cur = '';
for (const r of rows) {
  const head = `${r.fixture} S${r.session}`;
  if (head !== cur) {
    cur = head;
    console.log(`\n===== ${head} =====`);
    console.log(`${'spell'.padEnd(30)} ${'B+1'.padStart(4)} ${'obs'.padStart(4)} ${'%'.padStart(5)} ${'hits'.padStart(5)} ${'grupo'.padStart(6)} ${'faixa do grupo'.padStart(15)}  estado`);
  }
  if (r.topN == null) {
    console.log(`${r.label.slice(0,30).padEnd(30)} ${String(r.prev ?? '?').padStart(4)} ${'-'.padStart(4)} ${'-'.padStart(5)} ${String(r.hits).padStart(5)} ${'-'.padStart(6)}   (nenhum estado com >= ${MIN} hits)`);
    continue;
  }
  const pct = r.prev ? (r.topDistinct / r.prev * 100).toFixed(0) + '%' : '-';
  const over = r.prev && r.topDistinct > r.prev ? ' <== EXCEDE' : '';
  console.log(`${r.label.slice(0,30).padEnd(30)} ${String(r.prev ?? '?').padStart(4)} ${String(r.topDistinct).padStart(4)} ${pct.padStart(5)} ${String(r.hits).padStart(5)} ${String(r.topN).padStart(6)} ${(r.topMin + '-' + r.topMax).padStart(15)}  ${r.topMob} [${r.topFlags}]${r.stages ? ' *estagios*' : ''}${over}`);
}
