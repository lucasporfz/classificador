#!/usr/bin/env node
// diag-changed-turns.mjs — dado um diff entre dois dumps de tools/dump-unified.mjs
// (baseline vs depois de uma mudança), extrai automaticamente quais (fixture, sessão,
// turno) mudaram e imprime o detalhe hit-a-hit completo de cada um: dano original
// físico E holy, leech de vida/mana observado por hit com N_leech aceito e o esperado
// nesse N, e o setup global da sessão (leech base%, minor charms, BM on/off + pierce%,
// bônus de utevo grav san, crit multiplier por componente).
//
// Substitui escrever um script de scratchpad do zero toda vez que uma mudança no motor
// afeta turnos fora do alvo original e precisa de revisão turno a turno (Fase 4 da
// skill classifier-turn-fix).
//
// Uso:
//   node tools/dump-unified.mjs > baseline.txt          # antes da mudança
//   # ...aplica a mudança...
//   node tools/dump-unified.mjs > after.txt              # depois da mudança
//   diff baseline.txt after.txt > diff.txt
//   node tools/diag-changed-turns.mjs --diff diff.txt > depois-detalhado.txt
//   git stash                                            # volta pro código antes
//   node tools/diag-changed-turns.mjs --diff diff.txt > antes-detalhado.txt
//   git stash pop                                        # restaura a mudança
//
// O script sempre roda contra o código ATUALMENTE no disco — por isso o antes/depois
// exige rodar duas vezes (uma antes de editar ou com git stash), igual ao próprio
// dump-unified.mjs já exige para o diff compacto.
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path'; import process from 'node:process';
import { discoverFixturePairs } from './fixture-pairs.mjs';
const ROOT = process.cwd(); const read = p => fs.readFileSync(p, 'utf8');
const silent = { log(){}, warn(){}, error(){}, info(){}, debug(){} };
function freshCtx() {
  const ctx = { console: silent, Math, JSON, Array, Object, Number, String, Map, Set, isFinite, isNaN, parseInt, parseFloat, Date, Float32Array, Int32Array };
  ctx.globalThis = ctx; ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ['js/stats.js', 'js/mob-element-mods.js', 'js/mob-element-mods-post-2026-06-16.js', 'js/unified-formulas.js', 'js/unified-parsing.js', 'js/unified-setup-inference.js', 'js/unified-validation.js', 'js/unified-turn-resolution.js', 'js/unified-classification-engine.js'])
    vm.runInContext(read(path.join(ROOT, f)), ctx, { filename: f });
  return ctx;
}

const HEADER_RE = /^Channel .+ saved \w+ (\w+) +(\d+) (\d+:\d+:\d+) (\d{4})/;
const MONTHS = { Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Sept:8,Oct:9,Nov:10,Dec:11 };
function splitSessions(text) {
  const sessions = []; let cur = null;
  for (const line of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const m = line.match(HEADER_RE);
    if (m) {
      if (cur) { cur.text = cur.lines.join('\n'); sessions.push(cur); }
      const [, mon, day, time, year] = m; const [h, mi, s] = time.split(':').map(Number);
      cur = { header: line.trim(), year:+year, month: MONTHS[mon] ?? -1, day:+day, saveSec: h*3600+mi*60+s, lines:[line] };
    } else { if (!cur) cur = { header:'', year:0, month:0, day:0, saveSec:0, lines:[] }; cur.lines.push(line); }
  }
  if (cur) { cur.text = cur.lines.join('\n'); sessions.push(cur); }
  return sessions;
}
function buildPairs(svS, lcS) {
  const pairs = [];
  for (const sv of svS) {
    if (!sv.header) { if (svS.length === 1) pairs.push({ sv, lc: lcS[0] }); continue; }
    const cands = lcS.filter(lc => lc.header && lc.year===sv.year && lc.month===sv.month && lc.day===sv.day && Math.abs(lc.saveSec-sv.saveSec)<=3600);
    if (!cands.length) continue;
    cands.sort((a,b)=>Math.abs(a.saveSec-sv.saveSec)-Math.abs(b.saveSec-sv.saveSec));
    pairs.push({ sv, lc: cands[0] });
  }
  return pairs;
}
// tools/dump-unified.mjs exclui uma sessão específica de "jaded Server Log.txt"
// (09/Jun/2026, problema conhecido à parte) ANTES de numerar S0/S1/S2... — sem
// replicar esse filtro aqui, o S<N> extraído do diff apontaria pra sessão errada
// pra esse fixture. Se outro fixture ganhar um filtro ad-hoc parecido em
// dump-unified.mjs, replicar aqui também (ou extrair pra um módulo compartilhado).
const isTempExcludedJadedSession = sv => sv.year === 2026 && sv.month === 5 && sv.day === 9;
function applyKnownFixtureExclusions(svN, pairs) {
  if (svN === 'jaded Server Log.txt') return pairs.filter(p => !isTempExcludedJadedSession(p.sv));
  return pairs;
}
const fmt = s => `${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor((s%3600)/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
const pct = v => v == null ? '-' : `${(v*100).toFixed(2)}%`;

// svFileName -> lcFileName, pra resolver o nome de arquivo que aparece nas linhas do
// diff de volta no par de logs certo. Descoberto de logs/ (ver tools/fixture-pairs.mjs),
// igual a tools/report-unified-unclassified.mjs e tools/find-fixtures-by-owner-cast.mjs.
// A lista hardcoded anterior estava atrás do corpus (sem `uhax 3`, `serverlog6..9`,
// `monk 2`, `kim`, `death echo`, `dlc ms`...) e o efeito era SILENCIOSO: turnos desses
// fixtures apareciam no diff mas eram pulados pelo `continue` do loop, produzindo um
// review incompleto sem nenhum aviso. Não voltar a hardcodar.
const PAIRS_BY_SV = Object.fromEntries(
  discoverFixturePairs({ logDir: path.join(ROOT, 'logs') }).map(p => [p.server, p.local])
);

// Parseia linhas no formato que dump-unified.mjs emite:
// "<svFileName> S<N> ts=<ts> st=..." (aparecem em ambos os lados '<'/'>' de um diff -u
// ou diff comum; aceitamos as duas variantes, com ou sem prefixo de diff).
const LINE_RE = /^[<>]?\s*(.+?\.txt) S(\d+) ts=(\d+) st=/;
function parseDiffTargets(diffText) {
  const targets = new Map(); // svFileName -> Map(sessionIndex -> Set(ts))
  for (const line of diffText.split(/\r?\n/)) {
    const m = LINE_RE.exec(line);
    if (!m) continue;
    const [, svN, sIdx, ts] = m;
    if (!PAIRS_BY_SV[svN]) continue;
    if (!targets.has(svN)) targets.set(svN, new Map());
    const bySession = targets.get(svN);
    if (!bySession.has(+sIdx)) bySession.set(+sIdx, new Set());
    bySession.get(+sIdx).add(+ts);
  }
  return targets;
}

function dumpTurn(u, t) {
  console.log(`\n=== turno ${fmt(t.ts)} status=${t.status} reason=${t.reason || '-'} ===`);
  for (const c of (t.components || [])) {
    const leechK = c.leech && c.leech.k;
    console.log(`  comp=${c.comp} label=${c.actionLabel || '-'} hits=${(c.hits || []).length} N_leech_aceito=${leechK ?? '-'} leech.ok=${c.leech ? c.leech.ok : '-'} reason=${c.reason || '-'}`);
    const fitBySeq = new Map();
    for (const f of (c.leech && c.leech.fits) || []) { if (f && f.hit) fitBySeq.set(f.hit.seq, f); }
    for (const h of (c.hits || [])) {
      const p = h.evidence && h.evidence.physical;
      const holy = h.evidence && h.evidence.elemental && h.evidence.elemental.holy;
      const flags = [h.realCrit && 'CRIT', h.onslaught && 'ONS', h.lowBlow && 'LB', h.overkill && 'OK', h.isPrey && 'prey', h.exposeWeakness && 'EW'].filter(Boolean).join(' ');
      const phys = p && p.interval ? `O_fis=[${p.interval[0]},${p.interval[1]}]` : '';
      const holyStr = holy && holy.known ? `O_holy=[${(holy.originals || []).join(',')}]` : '';
      const fit = fitBySeq.get(h.seq);
      const n = fit && fit.fit ? fit.fit.n : (leechK ?? '-');
      let expLife = '-', expMana = '-';
      const checks = fit && fit.fit && fit.fit.official && fit.fit.official.checks;
      if (checks) {
        const lc2 = checks.find(x => x.channel === 'life');
        const mc = checks.find(x => x.channel === 'mana');
        if (lc2 && lc2.expectations && lc2.expectations[0]) expLife = lc2.expectations[0].expected;
        if (mc && mc.expectations && mc.expectations[0]) expMana = mc.expectations[0].expected;
      }
      console.log(`    ${fmt(h.ts)} seq=${String(h.seq || 0).padStart(5)} ${String(h.mob).padEnd(18)} dmg=${String(h.dmg).padStart(5)} ${flags.padEnd(13)} ${phys.padEnd(20)} ${holyStr.padEnd(16)} life=${String(h.lifeLeech ?? 0).padStart(4)}(N${n} esp.${expLife}) mana=${String(h.manaLeech ?? 0).padStart(4)}(N${n} esp.${expMana})`);
    }
  }
  const rej = t.rejected || [];
  if (rej.length) {
    console.log(`  partições rejeitadas: ${rej.length}`);
    for (const r of rej.slice(0, 40)) {
      const shape = r.candidate ? r.candidate.shape.join('>') : '?';
      const cuts = r.candidate ? r.candidate.cuts.join(',') : '?';
      const viols = (r.violations || []).map(v => v.reason).join('; ') || (r.ok ? 'OK(perdeu desempate)' : '?');
      console.log(`    ${shape} [${cuts}] -> ${viols}`);
    }
  }
}

const diffArgIndex = process.argv.indexOf('--diff');
const diffPath = diffArgIndex >= 0 ? process.argv[diffArgIndex + 1] : null;
if (!diffPath) {
  console.error('Uso: node tools/diag-changed-turns.mjs --diff <arquivo-diff-do-dump-unified>');
  process.exit(1);
}
const targets = parseDiffTargets(read(diffPath));
if (!targets.size) {
  console.error('Nenhuma linha "<arquivo.txt> S<N> ts=<ts> st=..." encontrada no diff.');
  process.exit(1);
}

for (const [svN, bySession] of targets) {
  const lcN = PAIRS_BY_SV[svN];
  const svP = path.join(ROOT, 'logs', svN), lcP = path.join(ROOT, 'logs', lcN);
  const svS = splitSessions(read(svP)), lcS = splitSessions(read(lcP));
  let pairs = (svS.length === 1 && lcS.length === 1) ? [{ sv: svS[0], lc: lcS[0] }] : buildPairs(svS, lcS);
  pairs = applyKnownFixtureExclusions(svN, pairs);
  for (const [sIdx, tsSet] of bySession) {
    const pair = pairs[sIdx];
    console.log(`\n################ ${svN} S${sIdx} ################`);
    if (!pair) { console.log('  par não encontrado'); continue; }
    console.log(`sessão: sv=${pair.sv.header.trim()}`);
    const ctx = freshCtx();
    const E = ctx.UnifiedClassificationEngine;
    const opts = { mobModsPre: ctx.MOB_ELEMENT_MODS, mobModsPost: ctx.MOB_ELEMENT_MODS_POST_2026_06_16, strictLeech: true, maxOriginal: 6000, useFloat16Mitigation: true };
    const u = E.classifyUnified(pair.sv.text, pair.lc.text, opts);
    if (u.error) { console.log('  ERRO do motor:', u.error); continue; }
    const ls = u.leechSetup || {};
    console.log(`--- setup da sessão ---`);
    console.log(`leech: life=${pct(ls.lifeBase)} mana=${pct(ls.manaBase)} confianca=${ls.confidence || '-'} evidencias=${ls.evidenceCount ?? '-'} contradicoes=${ls.contradictions ?? '-'}`);
    console.log(`  vampiric embrace: ${ls.vampiricMob ? ls.vampiricMob + ' +' + pct(ls.vampiricBonus) : '(nenhum)'}`);
    console.log(`  void's call: ${ls.voidsMob ? ls.voidsMob + ' +' + pct(ls.voidsBonus) : '(nenhum)'}`);
    const bm = u.bmPierceDetection || {};
    console.log(`BM (Battle Momentum): ${bm.active ? 'ON' : 'OFF'} pierce=${pct(bm.pierce)} fonte=${bm.source || '-'}`);
    const gs = u.gravSanSetup || {};
    console.log(`utevo grav san: bonus=${pct(gs.bonus)} (multiplicador ${gs.multiplier ?? '-'}) fonte=${gs.source || '-'}`);
    const cs = u.critSetup || {};
    console.log(`crit multiplier por componente: ${JSON.stringify(cs.byComponent || {})} (fallback ${cs.fallback ? cs.fallback.toFixed(3) : '-'})`);
    for (const t of (u.turns || [])) {
      if (!tsSet.has(t.ts)) continue;
      dumpTurn(u, t);
    }
  }
}
