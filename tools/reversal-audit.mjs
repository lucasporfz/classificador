#!/usr/bin/env node
// reversal-audit.mjs — mede se a reversão holy COLAPSA em inteiro exato cross-mob.
// Gate do Stage 0 do "modelo unificado": a premissa threshold-free do doc é que todo holy
// reverte para o MESMO inteiro entre mobs (igualdade ===). Aqui medimos o resíduo real,
// separando hits crit de não-crit, replicando EXATAMENTE a cadeia de reversão do código
// (rpAmplificationDivisor + prey + mitigação + mod elemental com pierce BM/EW).
//
// Uso: node tools/reversal-audit.mjs ["logs/<server>.txt" ...]   (default: um conjunto rep.)
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path'; import process from 'node:process';
const ROOT = process.cwd(); const read = p => fs.readFileSync(p, 'utf8');

const silent = { log(){}, warn(){}, error(){}, info(){}, debug(){} };
function freshCtx() {
  const ctx = { console: silent, Math, JSON, Array, Object, Number, String, Map, Set, isFinite, isNaN, parseInt, parseFloat, Date };
  vm.createContext(ctx);
  for (const f of ['js/stats.js', 'js/mob-element-mods.js', 'js/rp-grenade-peak.js',
                   'js/parser-rp-helpers.js', 'js/classifier-parser.js', 'js/classifier.js']) {
    vm.runInContext(read(path.join(ROOT, f)), ctx, { filename: f });
  }
  return ctx;
}
function splitSessions(text) {
  const headerRe = /^Channel .+ saved /;
  const sessions = []; let cur = null;
  for (const line of text.replace(/^﻿/, '').split(/\r?\n/)) {
    if (headerRe.test(line)) { if (cur) sessions.push(cur); cur = { header: line, lines: [line] }; }
    else if (cur) cur.lines.push(line);
  }
  if (cur) sessions.push(cur);
  if (sessions.length === 0) sessions.push({ header: '', lines: text.replace(/^﻿/, '').split(/\r?\n/) });
  return sessions.map(s => s.lines.join('\n'));
}

// Reversão holy COMPLETA, replicando o código (normalizeSeenDamageForElement + EW pierce).
function fullHolyBase(ctx, l, critMult, preyMult, bm) {
  const mods = ctx.getMobElementMods(l.mob);
  if (!mods || !(mods.holyDmgMod > 0)) return null;
  let dmg = l.dmg || 0;
  dmg /= ctx.rpAmplificationDivisor(l, critMult);
  if (l.isPrey && preyMult > 1) dmg /= preyMult;
  if (mods.mitigation > 0) dmg /= (1 - mods.mitigation / 100);
  const pierce = bm + (l.exposeWeakness ? 0.08 : 0);
  const mod = ctx.rpPiercedMod(mods.holyDmgMod, pierce);
  return mod > 0 ? dmg / mod : dmg;
}

function auditSession(ctx, svText) {
  // Replica o início do classifyWithLocalChat: detecta BM, re-parseia.
  ctx.rpSetBmPierce(0);
  let parsed = ctx.parseLogForClassifier(svText);
  if ((parsed.distinctMobs || 0) > 1 && ctx.rpDetectBmPierce(parsed.turnStats) > 0) {
    ctx.rpSetBmPierce(0.04);
    parsed = ctx.parseLogForClassifier(svText);
  }
  const bm = ctx.rpBmForElement('holyDmgMod');
  const critMult = parsed.critMultObserved || 0;
  const anyPrey = (parsed.turnStats || []).some(s => (s.rpComponentLines || []).some(l => l.isPrey));
  const preyMult = anyPrey ? 1.25 : (parsed.preyMult || 1);

  // Agrupa hits holy finais por (componente, ts) — mesma explosão/spell no mesmo segundo.
  const groups = new Map();
  for (const st of (parsed.turnStats || [])) for (const l of (st.rpComponentLines || [])) {
    const comp = l.correctedComponent;
    if (comp !== 'spell' && comp !== 'grenade') continue; // holy determinístico
    if (l.overkill) continue; // dano truncado não tem base para medir
    const base = fullHolyBase(ctx, l, critMult, preyMult, bm);
    if (base == null) continue;
    const k = comp + '|' + l.ts;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push({ mob: l.mob, base, crit: !!(l.realCrit || l.onslaught), ew: !!l.exposeWeakness });
  }
  return groups;
}

// Exatidão PURA da reversão: dentro de (comp, ts, mesmo mob, mesmo EW, não-crit), as bases
// revertidas têm que ser IDÊNTICAS se a cadeia for exata. Mede a taxa de colapso === aí.
// Isola o resíduo da reversão (crit-mult/prey/arredondamento) do resíduo cross-mob (mod elem).
function pureStats(groups) {
  const out = { sets: 0, exact: 0, le1: 0, worst: 0 };
  for (const hits of groups.values()) {
    const by = new Map();
    for (const h of hits) {
      if (h.crit) continue;
      const k = h.mob + '|' + (h.ew ? 1 : 0);
      if (!by.has(k)) by.set(k, []);
      by.get(k).push(Math.round(h.base));
    }
    for (const arr of by.values()) {
      if (arr.length < 2) continue;
      const spread = Math.max(...arr) - Math.min(...arr);
      out.sets++; if (spread === 0) out.exact++; if (spread <= 1) out.le1++;
      if (spread > out.worst) out.worst = spread;
    }
  }
  return out;
}

// Estatística de colapso: dentro de cada grupo com ≥2 mobs DISTINTOS, mede o spread das bases.
function collapseStats(groups) {
  const buckets = { nocrit: { groups: 0, exact: 0, le1: 0, le2: 0, worst: 0, spreads: [] },
                    crit:   { groups: 0, exact: 0, le1: 0, le2: 0, worst: 0, spreads: [] } };
  for (const hits of groups.values()) {
    for (const kind of ['nocrit', 'crit']) {
      const sub = hits.filter(h => kind === 'crit' ? h.crit : !h.crit);
      const mobs = new Set(sub.map(h => h.mob));
      if (sub.length < 2 || mobs.size < 2) continue; // precisa cross-mob p/ testar o ===
      // colapso = todas as bases iguais ao MESMO inteiro? medimos pelo spread do arredondado.
      const rounded = sub.map(h => Math.round(h.base));
      const spread = Math.max(...rounded) - Math.min(...rounded);
      const b = buckets[kind];
      b.groups++; b.spreads.push(spread);
      if (spread === 0) b.exact++;
      if (spread <= 1) b.le1++;
      if (spread <= 2) b.le2++;
      if (spread > b.worst) b.worst = spread;
    }
  }
  return buckets;
}

const argv = process.argv.slice(2);
const files = argv.length ? argv : [
  'logs/server log rp.txt',
  'logs/darklight server log rp.txt',
  'logs/jaded Server Log.txt',
  'logs/highwin 2 Server Log.txt',
];

const agg = { nocrit: { groups: 0, exact: 0, le1: 0, le2: 0, worst: 0 }, crit: { groups: 0, exact: 0, le1: 0, le2: 0, worst: 0 } };
const aggPure = { sets: 0, exact: 0, le1: 0, worst: 0 };
for (const f of files) {
  if (!fs.existsSync(f)) { console.log(`MISSING ${f}`); continue; }
  const sessions = splitSessions(read(f));
  const per = { nocrit: { groups: 0, exact: 0, le1: 0, le2: 0, worst: 0 }, crit: { groups: 0, exact: 0, le1: 0, le2: 0, worst: 0 } };
  const perPure = { sets: 0, exact: 0, le1: 0, worst: 0 };
  for (const sv of sessions) {
    const ctx = freshCtx();
    let groups; try { groups = auditSession(ctx, sv); } catch (e) { continue; }
    const b = collapseStats(groups);
    for (const k of ['nocrit', 'crit']) {
      per[k].groups += b[k].groups; per[k].exact += b[k].exact; per[k].le1 += b[k].le1; per[k].le2 += b[k].le2;
      per[k].worst = Math.max(per[k].worst, b[k].worst);
    }
    const ps = pureStats(groups);
    perPure.sets += ps.sets; perPure.exact += ps.exact; perPure.le1 += ps.le1; perPure.worst = Math.max(perPure.worst, ps.worst);
  }
  const pct = (n, d) => d ? (100 * n / d).toFixed(1) + '%' : '—';
  console.log(`\n=== ${f.replace(/^logs\//,'')} ===`);
  console.log(`  PURA (mesmo mob+EW, não-crit): sets=${String(perPure.sets).padStart(4)}  exato(===)=${pct(perPure.exact,perPure.sets).padStart(6)}  ≤1=${pct(perPure.le1,perPure.sets).padStart(6)}  pior=${perPure.worst}`);
  for (const k of ['nocrit', 'crit']) {
    const p = per[k];
    console.log(`  cross-mob ${k.padEnd(6)}: grupos=${String(p.groups).padStart(4)}  exato(===)=${pct(p.exact,p.groups).padStart(6)}  ≤1=${pct(p.le1,p.groups).padStart(6)}  ≤2=${pct(p.le2,p.groups).padStart(6)}  pior=${p.worst}`);
    for (const kk of ['groups','exact','le1','le2']) agg[k][kk] += p[kk];
    agg[k].worst = Math.max(agg[k].worst, p.worst);
  }
  for (const kk of ['sets','exact','le1']) aggPure[kk] += perPure[kk];
  aggPure.worst = Math.max(aggPure.worst, perPure.worst);
}
const pct = (n, d) => d ? (100 * n / d).toFixed(1) + '%' : '—';
console.log(`\n=== TOTAL ===`);
console.log(`  PURA (mesmo mob+EW, não-crit): sets=${String(aggPure.sets).padStart(4)}  exato(===)=${pct(aggPure.exact,aggPure.sets).padStart(6)}  ≤1=${pct(aggPure.le1,aggPure.sets).padStart(6)}  pior=${aggPure.worst}`);
for (const k of ['nocrit', 'crit']) {
  const p = agg[k];
  console.log(`  cross-mob ${k.padEnd(6)}: grupos=${String(p.groups).padStart(4)}  exato(===)=${pct(p.exact,p.groups).padStart(6)}  ≤1=${pct(p.le1,p.groups).padStart(6)}  ≤2=${pct(p.le2,p.groups).padStart(6)}  pior=${p.worst}`);
}
