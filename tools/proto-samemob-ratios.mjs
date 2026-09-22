#!/usr/bin/env node
// PROTOTIPO JOGA-FORA (wayfinder #14, 2a rodada). Testa a leitura do usuario:
// "sao varios perks existindo juntos" no eixo fisico.
//
// Predicao discriminante:
//   - PERK (multiplicador discreto que incide em alguns hits e nao em outros):
//     a razao entre os niveis de O dentro do MESMO cast/mob/estado se concentra em
//     poucos valores limpos (1,03 / 1,06 / 1,10 ...), com pouca dispersao.
//   - ROLL por alvo: as razoes formam um continuo sem picos.
//
// Roda so em blocos PUROS de spell (sem AA no grupo), 1 acao no turno, k>=3, eixo fisico.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { discoverFixturePairs } from './fixture-pairs.mjs';

const ROOT = process.cwd();
const read = p => fs.readFileSync(p, 'utf8');
const ENGINE = ['js/stats.js', 'js/mob-element-mods.js', 'js/mob-element-mods-post-2026-06-16.js', 'js/mob-element-mods-post-2026-08-25.js', 'js/unified-session-context.js', 'js/unified-formulas.js', 'js/unified-parsing.js', 'js/unified-setup-inference.js', 'js/unified-validation.js', 'js/unified-turn-resolution.js', 'js/unified-classification-engine.js'];

function freshCtx() {
  const silent = { log() {}, warn() {}, error() {}, info() {}, debug() {} };
  const c = { console: silent, Math, JSON, Array, Object, Number, String, Map, Set, isFinite, isNaN, parseInt, parseFloat, Date, Float32Array, Int32Array };
  c.globalThis = c; c.window = c; vm.createContext(c);
  for (const f of ENGINE) vm.runInContext(read(path.join(ROOT, f)), c, { filename: f });
  return c;
}

const HEADER_RE = /^Channel .+ saved \w+ (\w+) +(\d+) (\d+:\d+:\d+) (\d{4})/;
const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11, Sept: 8 };

function splitSessions(text) {
  const s = []; let cur = null; const pre = [];
  for (const line of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const m = line.match(HEADER_RE);
    if (m) {
      if (cur) { cur.text = cur.lines.join('\n'); s.push(cur); }
      const [, mon, day, time, year] = m; const [h, mi, sec] = time.split(':').map(Number);
      cur = { header: line.trim(), year: +year, month: MONTHS[mon] ?? -1, day: +day, saveSec: h * 3600 + mi * 60 + sec, lines: [line] };
    } else if (cur) cur.lines.push(line);
    else pre.push(line);
  }
  if (cur) { cur.text = cur.lines.join('\n'); s.push(cur); }
  if (!s.length) s.push({ header: '', year: 0, month: 0, day: 0, saveSec: 0, lines: pre, text: pre.join('\n') });
  return s;
}

function buildPairs(sv, lc) {
  if (sv.length === 1 && lc.length === 1) return [{ sv: sv[0], lc: lc[0] }];
  const out = [];
  for (const s of sv) {
    if (!s.header) continue;
    const c = lc.filter(x => x.header && x.year === s.year && x.month === s.month && x.day === s.day && Math.abs(x.saveSec - s.saveSec) <= 3600);
    if (!c.length) continue;
    c.sort((a, b) => Math.abs(a.saveSec - s.saveSec) - Math.abs(b.saveSec - s.saveSec));
    out.push({ sv: s, lc: c[0] });
  }
  return out;
}

const fmt = s => `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
const stateKey = h => [h.realCrit ? 'C' : '', h.onslaught ? 'O' : '', h.lowBlow ? 'L' : '', h.savageBlow ? 'S' : '', h.isPrey ? 'P' : '', h.exposeWeakness ? 'E' : '', h.omegaActive ? 'W' : '', h.multiStageStage || ''].join('');

const argv = process.argv.slice(2);
const pi = argv.indexOf('--pairs');
const want = pi >= 0 ? new Set(argv[pi + 1].split(',').map(s => s.trim())) : null;
const out = [];

for (const fx of discoverFixturePairs()) {
  if (want && !want.has(fx.key) && !want.has(fx.label)) continue;
  const svAll = splitSessions(read(path.join(ROOT, 'logs', fx.server)));
  const lcAll = splitSessions(read(path.join(ROOT, 'logs', fx.local)));
  const pairs = buildPairs(svAll, lcAll);
  for (let si = 0; si < pairs.length; si++) {
    const ctx = freshCtx();
    let u;
    try {
      u = ctx.UnifiedClassificationEngine.classifyUnified(pairs[si].sv.text, pairs[si].lc.text, {
        mobModsPre: ctx.MOB_ELEMENT_MODS || null,
        mobModsPost: ctx.MOB_ELEMENT_MODS_POST_2026_06_16 || null,
        strictLeech: true, maxOriginal: 6000, useFloat16Mitigation: true,
      });
    } catch (e) { continue; }
    if (!u || u.error) continue;
    const casts = ((u.facts && u.facts.local && u.facts.local.playerCasts) || []).filter(c => c.type === 'attack' || c.type === 'grenade');
    for (const t of (u.turns || [])) {
      if (casts.filter(c => c.ts >= t.ts - 1 && c.ts <= t.ts + 2).length !== 1) continue;
      const groups = new Map();
      for (const c of (t.components || [])) {
        const el = (c.action && c.action.profile && c.action.profile.element) || null;
        const label = c.actionLabel || 'AA';
        if (el !== 'physical') continue;
        for (const h of (c.hits || [])) {
          if (h.overkill || h.zeroDamageDodge || h.virtual) continue;
          const p = h.evidence && h.evidence.physical;
          if (!p || !p.interval) continue;
          const k = h.mob + '|' + stateKey(h);
          if (!groups.has(k)) groups.set(k, []);
          groups.get(k).push({ h, p, label });
        }
      }
      for (const g of groups.values()) {
        if (g.length < 3) continue;
        if (new Set(g.map(x => x.label)).size !== 1) continue; // bloco puro de UMA acao
        // centro do intervalo O de cada hit
        const cs = g.map(x => (x.p.interval[0] + x.p.interval[1]) / 2).sort((a, b) => a - b);
        // so interessa quando a intersecao nao fecha
        let lo = -Infinity, hi = Infinity;
        for (const x of g) { lo = Math.max(lo, x.p.interval[0]); hi = Math.min(hi, x.p.interval[1]); }
        if (lo <= hi) continue;
        out.push({
          fixture: fx.label, ts: fmt(t.ts), mob: g[0].h.mob, label: g[0].label, k: g.length,
          ratio: +(cs[cs.length - 1] / cs[0]).toFixed(4),
          Os: cs.map(v => Math.round(v)).join('/'),
          dmgs: g.map(x => x.h.dmg).sort((a, b) => a - b).join('/'),
        });
      }
    }
  }
}

out.sort((a, b) => a.ratio - b.ratio);
console.log(`blocos puros de UMA acao fisica, k>=3, com intersecao vazia: ${out.length}\n`);
console.log('ratio   fixture              ts        mob                  acao                            k  originais O');
for (const r of out) console.log(`${r.ratio.toFixed(4)}  ${r.fixture.padEnd(19)} ${r.ts}  ${r.mob.padEnd(20)} ${r.label.padEnd(31)} ${r.k}  ${r.Os}`);

// histograma das razoes
const bins = new Map();
for (const r of out) { const b = (Math.round(r.ratio * 100) / 100).toFixed(2); bins.set(b, (bins.get(b) || 0) + 1); }
console.log('\nhistograma de razao (max/min do bloco), passo 1%:');
for (const [b, n] of [...bins].sort()) console.log(`  ${b}  ${'#'.repeat(n)} ${n}`);
