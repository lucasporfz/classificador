#!/usr/bin/env node
// PROTOTIPO JOGA-FORA (wayfinder #14). Nao e ferramenta de validacao, nao entra no runner.
//
// Mede a dispersao same-mob (mesmo NOME de mob + mesmo estado, dentro do MESMO turno)
// no eixo FISICO e, como controle, no eixo ELEMENTAL.
//
// Nao usa a particao aceita pelo motor como verdade: achata todos os hits do turno.
// Para grupos de tamanho k>=3 aplica a "isencao de AA": o AA e single-target, logo no
// maximo 1 hit do grupo e AA. Remove-se o hit cuja remocao melhor aproxima o resto;
// o residual e dispersao que NENHUMA separacao de AA explica.
//
// Uso: node tools/proto-samemob-dispersion.mjs [--pairs "tom,bastion,night harpy"] [--csv out.csv]
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

// folga necessaria para fechar a intersecao de um conjunto de intervalos (0 = ja fecha)
function slack(ivs) {
  let lo = -Infinity, hi = Infinity;
  for (const v of ivs) { lo = Math.max(lo, v[0]); hi = Math.min(hi, v[1]); }
  return lo <= hi ? 0 : lo - hi;
}

// idem para conjuntos discretos (eixo elemental)
function setSlack(sets) {
  let inter = null;
  for (const s of sets) { const S = new Set(s); inter = inter === null ? S : new Set([...inter].filter(v => S.has(v))); }
  if (inter && inter.size) return 0;
  let best = Infinity;
  for (let i = 0; i < sets.length; i++) {
    for (let j = i + 1; j < sets.length; j++) {
      let d = Infinity;
      for (const a of sets[i]) for (const b of sets[j]) d = Math.min(d, Math.abs(a - b));
      if (d !== Infinity) best = Math.min(best, d);
    }
  }
  return best === Infinity ? 0 : best;
}

const argv = process.argv.slice(2);
const pi = argv.indexOf('--pairs');
const want = pi >= 0 ? new Set(argv[pi + 1].split(',').map(s => s.trim())) : null;
const ci = argv.indexOf('--csv');
const csvPath = ci >= 0 ? argv[ci + 1] : null;
const rows = [];

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
      const nActions = casts.filter(c => c.ts >= t.ts - 1 && c.ts <= t.ts + 2).length;
      const hits = [];
      for (const c of (t.components || [])) {
        const el = (c.action && c.action.profile && c.action.profile.element) || null;
        const topo = (c.action && c.action.profile && c.action.profile.topology) || '';
        for (const h of (c.hits || [])) hits.push({ h, comp: c.comp, label: c.actionLabel || '', reason: c.reason || '', el, topo });
      }
      const groups = new Map();
      for (const x of hits) {
        const h = x.h;
        if (h.overkill || h.zeroDamageDodge || h.virtual) continue;
        const p = h.evidence && h.evidence.physical;
        const e = h.evidence && h.evidence.elemental;
        // eixo vem do PERFIL DA ACAO (nao da particao): fisico so quando a acao e fisica.
        let axis = null, ev = null;
        if (x.el === 'physical' || (!x.el && x.comp === 'arrow')) { if (p && p.interval) { axis = 'physical'; ev = p; } }
        else if (x.el && e && e[x.el] && e[x.el].originals && e[x.el].originals.length) { axis = 'elemental'; ev = e[x.el]; }
        if (!axis) continue;
        const k = axis + '|' + h.mob + '|' + stateKey(h);
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push({ ...x, axis, p: axis === 'physical' ? ev : null, e: axis === 'elemental' ? ev : null });
      }
      for (const g of groups.values()) {
        if (g.length < 2) continue;
        const axis = g[0].axis;
        const ivs = g.map(x => (axis === 'physical' ? x.p.interval : null));
        const sets = g.map(x => (axis === 'physical' ? null : x.e.originals));
        const full = axis === 'physical' ? slack(ivs) : setSlack(sets);
        let residual = full;
        if (g.length >= 3) {
          residual = Infinity;
          for (let i = 0; i < g.length; i++) {
            const s = axis === 'physical' ? slack(ivs.filter((_, j) => j !== i)) : setSlack(sets.filter((_, j) => j !== i));
            if (s < residual) residual = s;
          }
        }
        const dmgs = g.map(x => +x.h.dmg);
        const armorW = axis === 'physical' ? (g[0].p.armorHigh - g[0].p.armorLow) : 0;
        const modRaw = axis === 'physical' ? +g[0].p.mod : (g[0].e.mod != null ? +g[0].e.mod : 0);
        const armorEff = axis === 'physical' ? g[0].p.armorEff : 0;
        rows.push({
          fixture: fx.label, session: si, ts: fmt(t.ts), axis, mob: g[0].h.mob,
          nActions, oneSecond: new Set(g.map(x => x.h.ts)).size === 1 ? 1 : 0,
          state: g[0].h && stateKey(g[0].h), k: g.length, dmgs: dmgs.join('/'),
          medDmg: dmgs.slice().sort((a, b) => a - b)[Math.floor(dmgs.length / 2)],
          armorW, armorEff, elem: g[0].el || '', topo: g[0].topo || '', labels: [...new Set(g.map(x => x.label || 'AA'))].join('+'), mod: +modRaw.toFixed(4), armorWO: armorW && modRaw ? +(armorW / modRaw).toFixed(1) : 0,
          fullSlack: full, residual: residual === Infinity ? full : residual,
          sameComp: new Set(g.map(x => x.comp + '|' + x.label)).size === 1 ? 1 : 0,
          reason: g[0].reason, status: t.status,
        });
      }
    }
  }
}

if (csvPath) {
  const cols = Object.keys(rows[0] || {});
  fs.writeFileSync(csvPath, [cols.join(','), ...rows.map(r => cols.map(c => String(r[c]).replace(/,/g, ';')).join(','))].join('\n'));
  console.error(`csv -> ${csvPath} (${rows.length} grupos)`);
}
process.stdout.write(JSON.stringify(rows));
