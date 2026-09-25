#!/usr/bin/env node
// PROTOTIPO (descartavel) — estancia elemental de sorcerer e conversao do proximo cast.
//
// Mecanica declarada pelo usuario: com a estancia E (uteta vis = energy, uteta flam = fire,
// uteta mort = death), cada magia OFENSIVA de elemento E arma a conversao; a proxima magia
// ofensiva de elemento != E sai convertida para E. Outra magia de elemento E enquanto armado
// desperdica a conversao (e rearma).
//
// O que este proto mede, por sessao de sorcerer:
//   - elemento OBSERVADO de cada bloco de spell, pela consistencia cross-mob da reversao
//     (mesmo principio de D-010a: normaliza mitigacao e mod, o elemento certo colapsa os
//     mobs num nivel so);
//   - qual estancia E explica melhor a sequencia, rodando a maquina de estados e comparando
//     com o observado (acertos x contradicoes);
//   - quantas conversoes foram desperdicadas (cast de E com a conversao armada).
//
// Uso: node tools/proto-sorcerer-stance.mjs [substring do fixture]
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { discoverFixturePairs } from './fixture-pairs.mjs';
import { splitSessions, pairSessions } from './unified-corpus.mjs';

const ROOT = process.cwd();
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const FILES = ['js/mob-element-mods.js', 'js/mob-element-mods-post-2026-06-16.js', 'js/mob-element-mods-post-2026-08-25.js', 'js/unified-session-context.js', 'js/unified-formulas.js', 'js/unified-parsing.js', 'js/unified-setup-inference.js', 'js/unified-validation.js', 'js/unified-turn-resolution.js', 'js/unified-classification-engine.js'];
const silent = { log(){}, warn(){}, error(){}, info(){}, debug(){} };
const ctx = { console: silent, Math, JSON, Array, Object, Number, String, Map, Set, WeakMap, Date, isFinite, isNaN, parseInt, parseFloat, Float32Array, Int32Array };
ctx.globalThis = ctx; ctx.window = ctx;
vm.createContext(ctx);
for (const f of FILES) vm.runInContext(read(f), ctx, { filename: f });
const engine = ctx.UnifiedClassificationEngine;
const OPTS = { mobModsPre: ctx.MOB_ELEMENT_MODS, mobModsPost: ctx.MOB_ELEMENT_MODS_POST_2026_06_16, strictLeech: true, maxOriginal: 6000, useFloat16Mitigation: true };

const ELEMENTS = ['death', 'energy', 'fire', 'ice', 'earth'];
const STANCES = { 'uteta vis': 'energy', 'uteta flam': 'fire', 'uteta mort': 'death' };
const eff = (b, p) => {
  if (!(p > 0) || !(b > 0)) return b;
  const first = Math.min(Math.max(0, 1 - b), p);
  const rest = Math.max(0, p - first);
  return Math.min(b + first + Math.ceil(Math.round(rest * 100) / 2) / 100, b * 2);
};

// Elemento observado de um bloco: normaliza cada hit pelo mod/mitigacao do seu mob e mede o
// pior desvio DENTRO de cada segundo (um segundo = um estagio, um nivel so). O elemento certo
// colapsa mobs diferentes no mesmo nivel.
// v2: so vota grupo (mesmo segundo) com >=2 MOBS DISTINTOS — hits do mesmo mob fecham em
// qualquer elemento e nao discriminam nada. Cada mob entra pela mediana dos seus hits no
// grupo. Se todas as candidatas fecham, o bloco e mudo (nao discrimina). Beam fica de fora:
// central/side sao dois niveis legitimos no mesmo segundo (M-035).
function observedElement(hits, table, label) {
  if (/beam/i.test(label || '')) return { fits: [], score: {}, measurable: false };
  const usable = hits.filter(h => !h.overkill && h.dmg > 0 && table[String(h.mob).toLowerCase()]);
  const score = {};
  for (const el of ELEMENTS) {
    const byTs = new Map();
    let broken = false;
    for (const h of usable) {
      const m = table[String(h.mob).toLowerCase()];
      const mod = m[el + 'DmgMod'];
      if (!(mod > 0)) { broken = true; break; }
      const o = h.dmg / ((1 - m.mitigation / 100) * eff(mod, h.exposeWeakness ? 0.08 : 0));
      if (!byTs.has(h.ts)) byTs.set(h.ts, new Map());
      const byMob = byTs.get(h.ts);
      const key = String(h.mob).toLowerCase();
      if (!byMob.has(key)) byMob.set(key, []);
      byMob.get(key).push(o);
    }
    if (broken) continue;
    let worst = null;
    for (const byMob of byTs.values()) {
      if (byMob.size < 2) continue;
      const reps = [...byMob.values()].map(v => v.sort((a, b) => a - b)[Math.floor(v.length / 2)]);
      // Absoluto, em unidades de dano original: e o que o motor usa
      // (`elementalBlockTolerance` = 2) mais 1 de arredondamento do floor da reversao.
      worst = Math.max(worst == null ? 0 : worst, Math.max(...reps) - Math.min(...reps));
    }
    if (worst != null) score[el] = worst;
  }
  const fits = Object.entries(score).filter(([, v]) => v <= 3).map(([k]) => k);
  const measurable = Object.keys(score).length > 0 && fits.length > 0 && fits.length < Object.keys(score).length;
  return { fits, score, measurable };
}

// Canal 2 (boss/mob unico): o MESMO spell no MESMO mob alterna entre nivel convertido e
// nativo. Normalizado pelo elemento PREVISTO por uma hipotese de estancia, o original de
// cada cast so fica numa distribuicao unica se a hipotese estiver certa. Metrica: desvio
// padrao de log(O) por (spell, mob), medio ponderado. Menor = melhor.
function levelDispersion(sim, table) {
  const groups = new Map();
  for (const c of sim) {
    if (/beam/i.test(c.label || '')) continue;
    const firstTs = Math.min(...c.hits.map(h => h.ts));
    const perMob = new Map();
    for (const h of c.hits) {
      if (h.overkill || !(h.dmg > 0) || h.ts !== firstTs) continue;
      const key = String(h.mob).toLowerCase();
      const m = table[key];
      if (!m) continue;
      const mod = m[c.predicted + 'DmgMod'];
      if (!(mod > 0)) continue;
      const o = h.dmg / ((1 - m.mitigation / 100) * eff(mod, h.exposeWeakness ? 0.08 : 0));
      perMob.set(key, Math.max(perMob.get(key) || 0, o));
    }
    for (const [mob, o] of perMob) {
      const g = `${c.incantation}|${mob}`;
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(Math.log(o));
    }
  }
  let num = 0, den = 0;
  for (const v of groups.values()) {
    if (v.length < 6) continue;
    const mean = v.reduce((a, b) => a + b, 0) / v.length;
    const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length);
    num += sd * v.length; den += v.length;
  }
  return den ? { sd: num / den, n: den } : { sd: null, n: 0 };
}

// Maquina de estados da conversao para a estancia E.
function simulate(casts, stance) {
  let armed = false;
  const out = [];
  for (const c of casts) {
    const native = c.element;
    let predicted = native;
    let kind = 'native';
    if (native === stance) {
      kind = armed ? 'wasted' : 'arm';
      armed = true;
    } else if (armed) {
      predicted = stance;
      kind = 'converted';
      armed = false;
    }
    out.push({ ...c, predicted, kind });
  }
  return out;
}

const filter = process.argv[2] || '';
// Tabela do REGIME da sessao, como o motor (D-016): pre-cutoff usa MOB_ELEMENT_MODS.
const tableFor = regime => String(regime || '').startsWith('post')
  ? Object.assign({}, ctx.MOB_ELEMENT_MODS_POST_2026_06_16, regime === 'post-2026-08-25' ? ctx.MOB_ELEMENT_MODS_POST_2026_08_25 : {})
  : ctx.MOB_ELEMENT_MODS;
let table = null;
for (const pair of discoverFixturePairs({ logDir: path.join(ROOT, 'logs') })) {
  if (filter && !pair.label.includes(filter) && !pair.server.includes(filter)) continue;
  const svText = read(path.join('logs', pair.server));
  const lcText = read(path.join('logs', pair.local));
  // Pre-filtro barato: so vale classificar se o log tem incantacao exclusiva de sorcerer.
  if (!/exevo (mort ora|gran vis lux|gran mas vis|gran mas flam|vis hur|flam hur|max mort|gran mas pox|mas san)/i.test(lcText)) continue;
  const sessions = pairSessions(splitSessions(svText), splitSessions(lcText));
  for (let i = 0; i < sessions.length; i++) {
    let u;
    try { u = engine.classifyUnified(sessions[i].sv.text, sessions[i].lc.text, OPTS); } catch (e) { console.log(`${pair.label} S${i}: ERRO ${e.message}`); continue; }
    if (u.error || u.vocation !== 'sorcerer') continue;

    table = tableFor(u.mobModsRegime);
    const owner = u.selectedSpeaker;
    const utetaCasts = ((u.facts?.local?.playerCasts) || [])
      .filter(c => STANCES[String(c.text || '').trim().toLowerCase()])
      .map(c => `${c.clock} ${c.text}`);

    // A maquina de estados anda sobre TODOS os casts ofensivos do dono (do local chat), nao
    // so os que cairam num bloco resolvido: um cast em turno sem classificacao tambem arma
    // ou consome a conversao. Os hits vem do bloco resolvido cuja acao e aquele cast.
    const hitsByAction = new Map();
    for (const t of u.turns || []) {
      for (const c of t.components || []) {
        if (c.comp === 'spell' && c.action) hitsByAction.set(c.action.id, c.hits || []);
      }
    }
    const casts = [];
    for (const pc of (u.facts?.local?.playerCasts) || []) {
      const profile = pc.profile || {};
      if (profile.type !== 'attack' || !profile.element || profile.element === 'unknown' || profile.element === 'physical') continue;
      const hits = hitsByAction.get(pc.id) || [];
      casts.push({ clock: pc.clock, ts: pc.ts, incantation: profile.incantation, element: profile.element, label: profile.label, hits, obs: observedElement(hits, table, profile.label) });
    }
    if (!casts.length) continue;
    const turnTs = (u.turns || []).map(t => t.ts);
    const spanLo = Math.min(...turnTs) - 2, spanHi = Math.max(...turnTs) + 2;
    if (process.env.VERBOSE) {
      for (const c of casts.filter(c => c.hits.length).slice(0, +process.env.VERBOSE)) {
        const mobs = new Set(c.hits.map(h => h.mob)).size;
        console.log(`  ${c.clock} ${c.label} hits=${c.hits.length} mobs=${mobs} fits=${c.obs.fits.join('/') || '-'} ${Object.entries(c.obs.score).map(([k, v]) => k + "=" + v.toFixed(1)).join(' ')}`);
      }
    }

    const report = [];
    for (const stance of ['energy', 'fire', 'death', 'none']) {
      const sim = simulate(casts, stance);
      let ok = 0, bad = 0, mute = 0;
      for (const c of sim) {
        if (!c.obs.measurable || !c.obs.fits.length) { mute++; continue; }
        if (c.obs.fits.length > 1 && c.obs.fits.includes(c.predicted)) { ok++; continue; }
        if (c.obs.fits.length === 1 && c.obs.fits[0] === c.predicted) ok++;
        else if (c.obs.fits.includes(c.predicted)) ok++;
        else bad++;
      }
      // A maquina anda sobre o chat inteiro (o estado vem de antes do server log comecar),
      // mas so conta o que cai dentro do trecho que o server log cobre.
      const inSpan = c => c.ts >= spanLo && c.ts <= spanHi;
      const wasted = sim.filter(c => inSpan(c) && c.kind === 'wasted').length;
      const converted = sim.filter(c => inSpan(c) && c.kind === 'converted').length;
      report.push({ stance, ok, bad, mute, wasted, converted, sim, level: levelDispersion(sim, table) });
    }
    report.sort((a, b) => (a.bad - b.bad) || ((a.level.sd ?? 9) - (b.level.sd ?? 9)));
    const best = report[0];
    console.log(`\n=== ${pair.label} S${i} — ${owner} (sorcerer, ${u.mobModsRegime}), ${casts.length} casts ofensivos`);
    console.log(`    uteta do dono: ${utetaCasts.length ? utetaCasts.join(', ') : '(nenhum)'}`);
    const motor = u.sorcererStanceSetup || {};
    console.log(`    MOTOR: ${motor.stance} (${motor.source}) candidatas ${JSON.stringify((motor.candidates || []).map(c => [c.stance, c.contradictions, c.confirmations]))} resumo ${JSON.stringify(motor.summary)}`);
    for (const r of report) {
      console.log(`    estancia ${r.stance.padEnd(6)}: acertos ${r.ok}, contradicoes ${r.bad}, mudos ${r.mute}, convertidos ${r.converted}, desperdicados ${r.wasted} | dispersao de nivel sd=${r.level.sd == null ? '-' : r.level.sd.toFixed(4)} (n=${r.level.n})`);
    }
    for (const c of best.sim) {
      if (!c.obs.measurable || !c.obs.fits.length) continue;
      if (c.obs.fits.includes(c.predicted)) continue;
      console.log(`    CONTRADIZ ${c.clock} ${c.label} nativo=${c.element} previsto=${c.predicted} (${c.kind}) observado=${c.obs.fits.join('/')}`);
    }
    // Validade da carga: intervalo entre o ultimo cast que armou e a conversao CONFIRMADA
    // pelo dano (o bloco fecha no elemento da estancia e nao no nativo).
    if (best.stance !== 'none') {
      let lastArm = null;
      const gaps = [];
      for (const c of best.sim) {
        if (c.kind === 'arm' || c.kind === 'wasted') { lastArm = c.ts; continue; }
        if (c.kind === 'converted' && lastArm != null && c.obs.measurable
          && c.obs.fits.includes(best.stance) && !c.obs.fits.includes(c.element)) gaps.push(c.ts - lastArm);
      }
      gaps.sort((a, b) => a - b);
      if (gaps.length) console.log(`    carga: ${gaps.length} conversoes confirmadas, intervalo arma->converte min ${gaps[0]}s mediana ${gaps[Math.floor(gaps.length / 2)]}s max ${gaps[gaps.length - 1]}s`);
    }
  }
}
