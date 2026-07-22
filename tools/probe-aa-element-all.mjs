#!/usr/bin/env node
// Sonda de viabilidade (Fase 3) — NÃO é ferramenta de validação, não entra no runner.
//
// Roda o critério de inferência do ELEMENTO DO AA (ver tools/probe-aa-element.mjs) em
// TODOS os fixtures descobertos, POR SESSÃO — a inferência é por sessão, então medir o
// arquivo inteiro misturaria regimes. Contexto de VM novo por par, como dump-unified.mjs.
//
// Objetivo: provar que o critério devolve `physical` em todo fixture antigo e só
// `energy` em `thunder arrow`.
//
// Uso: node tools/probe-aa-element-all.mjs [--pairs "a,b,c"]
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path';
import { discoverFixturePairs } from './fixture-pairs.mjs';

const ROOT = process.cwd();
const read = p => fs.readFileSync(p, 'utf8');
const ENGINE_FILES = ['js/stats.js', 'js/mob-element-mods.js', 'js/mob-element-mods-post-2026-06-16.js', 'js/unified-formulas.js', 'js/unified-parsing.js', 'js/unified-setup-inference.js', 'js/unified-validation.js', 'js/unified-turn-resolution.js', 'js/unified-classification-engine.js'];

function freshCtx() {
  const silent = { log(){}, warn(){}, error(){}, info(){}, debug(){} };
  const ctx = { console: silent, Math, JSON, Array, Object, Number, String, Map, Set, isFinite, isNaN, parseInt, parseFloat, Date, Float32Array, Int32Array };
  ctx.globalThis = ctx; ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ENGINE_FILES) vm.runInContext(read(path.join(ROOT, f)), ctx, { filename: f });
  return ctx;
}

const HEADER_RE = /^Channel .+ saved \w+ (\w+) +(\d+) (\d+:\d+:\d+) (\d{4})/;
const MONTHS = { Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11 };
function splitSessions(text) {
  const sessions = []; let cur = null; const pre = [];
  for (const line of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const m = line.match(HEADER_RE);
    if (m) {
      if (cur) { cur.text = cur.lines.join('\n'); sessions.push(cur); }
      const [, mon, day, time, year] = m; const [h, mi, s] = time.split(':').map(Number);
      cur = { header: line.trim(), year:+year, month: MONTHS[mon] ?? -1, day:+day, saveSec: h*3600+mi*60+s, lines:[line] };
    } else if (cur) cur.lines.push(line); else pre.push(line);
  }
  if (cur) { cur.text = cur.lines.join('\n'); sessions.push(cur); }
  if (!sessions.length) sessions.push({ header:'', year:0, month:0, day:0, saveSec:0, lines: pre, text: pre.join('\n') });
  return sessions;
}
function buildPairs(svAll, lcAll) {
  if (svAll.length === 1 && lcAll.length === 1) return [{ sv: svAll[0], lc: lcAll[0] }];
  const out = [];
  for (const sv of svAll) {
    if (!sv.header) continue;
    const c = lcAll.filter(lc => lc.header && lc.year === sv.year && lc.month === sv.month && lc.day === sv.day && Math.abs(lc.saveSec - sv.saveSec) <= 3600);
    if (!c.length) continue;
    c.sort((a, b) => Math.abs(a.saveSec - sv.saveSec) - Math.abs(b.saveSec - sv.saveSec));
    out.push({ sv, lc: c[0] });
  }
  return out;
}

// Elementos candidatos: decisão do usuário 22/Jul/2026 — munição de área elemental só
// existe em energy/ice/fire/earth. `holy` sairia circular (é o eixo da spell usada como
// referência) e `death` não tem munição.
const ELEMENTS = ['physical', 'energy', 'ice', 'fire', 'earth'];
const KEY = { energy: 'energyDmgMod', ice: 'iceDmgMod', fire: 'fireDmgMod', earth: 'earthDmgMod', holy: 'holyDmgMod' };
const HOLY_AREA = new Set(['exevo mas san', 'exori dir san']);
const PHYSICAL_SPELL = new Set(['exori dir moe']);
const GRENADE = new Set(['exevo tempo mas san']);

function inferForSession(ctx, svText, lcText) {
  const F = ctx.UnifiedFormulas;
  const u = ctx.UnifiedClassificationEngine.classifyUnified(svText, lcText, {
    mobModsPre: ctx.MOB_ELEMENT_MODS || null,
    mobModsPost: ctx.MOB_ELEMENT_MODS_POST_2026_06_16 || null,
    strictLeech: true, maxOriginal: 6000, useFloat16Mitigation: true,
  });
  if (u.error) return { error: u.error };
  const context = u._context;

  const elementalOriginals = (hit, element) => {
    const mods = F.getMobMods(hit.mob, context);
    const k = KEY[element];
    if (!mods || !(mods[k] > 0)) return [];
    const mod = F.effectiveMod(+mods[k], F.pierceForElement(element, hit, context));
    const mit = F.mitigationMultiplier(mods, context);
    const post = F.postMultiplier(hit, context);
    const crit = F.criticalMultiplierForHit(hit, context);
    const ps = hit && hit.perfectShot ? F.PERFECT_SHOT_PREMIT_BONUS : 0;
    const collect = (tol) => {
      const t = Math.max(0, tol || 0); const out = new Set();
      for (const aIv of F.inversePostMultiplierIntervals(+hit.dmg, post))
        for (let a0 = aIv[0]; a0 <= aIv[1]; a0++)
          for (let a = Math.max(1, a0 - t); a <= a0 + t; a++) {
            const eIv = F.invFloor(a, mit); if (!eIv) continue;
            for (let c = eIv[0]; c <= eIv[1]; c++) {
              const pre = c - ps; if (pre < 1) continue;
              for (const pc of F.inverseCriticalMultiplierIntervals(pre, crit))
                for (let e = pc[0]; e <= pc[1]; e++)
                  for (let ee = Math.max(1, e - t); ee <= e + t; ee++) {
                    const oIv = F.invCeil(ee, mod); if (!oIv) continue;
                    for (let o = oIv[0]; o <= oIv[1]; o++) if (o > 0) out.add(o);
                  }
            }
          }
      return out;
    };
    let out = collect(0);
    if (!out.size && F.ELEMENTAL_INTERMEDIATE_TOLERANCE > 0) out = collect(F.ELEMENTAL_INTERMEDIATE_TOLERANCE);
    return Array.from(out);
  };

  const closes = (hits, element) => {
    if (!hits.length) return false;
    let inter = null;
    for (const h of hits) {
      if (h.overkill) continue;
      let set;
      if (element === 'physical') {
        const r = F.physicalOriginalInterval(h, context);
        if (!r.known || !r.interval) return false;
        set = new Set(); for (let v = r.interval[0]; v <= r.interval[1]; v++) set.add(v);
      } else {
        const os = elementalOriginals(h, element);
        if (!os.length) return false;
        set = new Set(os);
      }
      inter = inter === null ? set : new Set([...inter].filter(v => set.has(v)));
      if (!inter.size) return false;
    }
    return !!(inter && inter.size);
  };

  const casts = (u.facts.local.playerCasts || []).filter(c => c.type === 'attack' || c.type === 'grenade');
  const tally = Object.fromEntries(ELEMENTS.map(e => [e, 0]));
  let eligible = 0;
  for (const t of (u.turns || [])) {
    const hits = (t.hits || []).filter(h => F.isMainHit(h));
    if (hits.length < 2) continue;
    const inc = new Set(casts.filter(c => c.ts >= t.ts - 1 && c.ts <= t.ts + 2).map(c => c.profile && c.profile.incantation));
    if ([...inc].some(i => PHYSICAL_SPELL.has(i))) continue;
    if ([...inc].some(i => GRENADE.has(i))) continue;
    if (casts.some(c => GRENADE.has(c.profile && c.profile.incantation) && t.ts >= c.ts + 1 && t.ts <= c.ts + 5)) continue;
    if (![...inc].some(i => HOLY_AREA.has(i))) continue;
    eligible++;
    for (const el of ELEMENTS) {
      for (let k = 1; k < hits.length; k++) {
        if (closes(hits.slice(k), 'holy') && closes(hits.slice(0, k), el)) { tally[el]++; break; }
      }
    }
  }
  const ranked = ELEMENTS.map(e => [e, tally[e]]).sort((a, b) => b[1] - a[1]);
  const best = ranked[0][1];
  // Sem NENHUMA evidência, ou empate no topo incluindo physical: físico é o padrão.
  const winners = ranked.filter(r => r[1] === best).map(r => r[0]);
  const decided = best === 0
    ? 'physical (sem evidência)'
    : winners.length === 1
      ? winners[0]
      : winners.includes('physical') ? 'physical (empate)' : winners[0] + ' (empate)';
  return { eligible, tally, decided, vocation: u.vocation, ranked };
}

const pairsArg = process.argv.indexOf('--pairs');
const only = pairsArg >= 0 ? new Set(String(process.argv[pairsArg + 1] || '').split(',').map(s => s.trim().toLowerCase())) : null;
const PAIRS = discoverFixturePairs({ logDir: path.join(ROOT, 'logs') }).filter(p => !only || only.has(p.label.toLowerCase()));

// discoverFixturePairs devolve nome de arquivo, não caminho absoluto.
const resolveLog = f => path.isAbsolute(f) ? f : path.join(ROOT, 'logs', path.basename(f));

for (const p of PAIRS) {
  const svAll = splitSessions(read(resolveLog(p.server)));
  const lcAll = splitSessions(read(resolveLog(p.local)));
  const sess = buildPairs(svAll, lcAll);
  if (!sess.length) { console.log(`${p.label}: nenhum par de sessão`); continue; }
  for (let i = 0; i < sess.length; i++) {
    const ctx = freshCtx();
    let r;
    try { r = inferForSession(ctx, sess[i].sv.text, sess[i].lc.text); }
    catch (err) { console.log(`${p.label} S${i}: ERRO ${err.message}`); continue; }
    if (r.error) { console.log(`${p.label} S${i}: motor -> ${r.error}`); continue; }
    if (r.vocation && r.vocation !== 'paladin') { console.log(`${p.label} S${i}: voc=${r.vocation} (fora de escopo RP)`); continue; }
    const detail = r.ranked.map(([e, n]) => `${e}=${n}`).join(' ');
    console.log(`${p.label} S${i}: eleg=${r.eligible} -> ${r.decided}   [${detail}]`);
  }
}
